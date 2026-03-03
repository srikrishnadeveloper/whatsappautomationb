/**
 * AI-Powered Search Service
 * Uses Gemini AI to search through messages and find relevant information.
 *
 * Token-saving strategy (reduces AI usage ~80%):
 *  1. Keyword pre-filter: score all messages locally, take top 60 most relevant.
 *  2. Content truncation: send only the first 150 chars of each message.
 *  3. Response cache: identical queries within 5 minutes reuse the last result.
 */

import { createHash } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import log from './activity-log';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

// ── Response cache ──────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
interface CacheEntry { result: AISearchResponse; expiresAt: number; }
const queryCache = new Map<string, CacheEntry>();

function cacheKey(query: string, messageCount: number): string {
  return createHash('md5').update(`${query}:${messageCount}`).digest('hex');
}

function getCached(key: string): AISearchResponse | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { queryCache.delete(key); return null; }
  return entry.result;
}

function setCached(key: string, result: AISearchResponse): void {
  // Evict old entries whenever cache grows beyond 50 items
  if (queryCache.size >= 50) {
    const oldest = queryCache.keys().next().value;
    if (oldest) queryCache.delete(oldest);
  }
  queryCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Local keyword pre-filter ──────────────────────────────────────────────
/**
 * Score messages locally by query keyword overlap.
 * Searches through content, sender, chat name, AND metadata
 * (image descriptions, document names, extracted text, document summaries).
 * Returns the top `limit` messages, sorted by relevance descending.
 */
function preFilterMessages(
  query: string,
  messages: MessageData[],
  limit: number = 60
): MessageData[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 2); // include short words for names/jargon

  if (terms.length === 0) return messages.slice(0, limit);

  const scored = messages.map(m => {
    // Build searchable text from content + sender + chat name
    let text = `${m.sender} ${m.chat_name ?? ''} ${m.content}`.toLowerCase();

    // Append metadata fields for media-aware searching
    if (m.metadata) {
      const meta = m.metadata;
      if (meta.imageAnalysis) {
        text += ` ${meta.imageAnalysis.description || ''} ${meta.imageAnalysis.extractedText || ''}`;
      }
      if (meta.documentAnalysis) {
        text += ` ${meta.documentAnalysis.summary || ''} ${meta.documentAnalysis.extractedText || ''}`;
        text += ` ${(meta.documentAnalysis.keyEntities || []).join(' ')}`;
      }
      if (meta.document) {
        text += ` ${meta.document.fileName || ''}`;
      }
      if (meta.mediaType) {
        text += ` ${meta.mediaType}`;
      }
    }
    text = text.toLowerCase();

    let score = 0;
    for (const term of terms) {
      // Exact term hits
      const idx = text.indexOf(term);
      if (idx !== -1) {
        score += term.length; // Longer term matches score more
        // Bonus: match in sender/chat name is more significant
        const metaText = `${m.sender} ${m.chat_name ?? ''}`.toLowerCase();
        if (metaText.includes(term)) score += 4;
        // Bonus: match in image/document analysis
        if (m.metadata?.imageAnalysis) {
          const imgText = `${m.metadata.imageAnalysis.description || ''} ${m.metadata.imageAnalysis.extractedText || ''}`.toLowerCase();
          if (imgText.includes(term)) score += 3;
        }
        if (m.metadata?.documentAnalysis) {
          const docText = `${m.metadata.documentAnalysis.summary || ''} ${m.metadata.documentAnalysis.extractedText || ''}`.toLowerCase();
          if (docText.includes(term)) score += 3;
        }
      }
    }
    return { msg: m, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.msg);
}

// Initialize Gemini for search
export function initSearchAI() {
  if (!GEMINI_API_KEY) {
    log.warning('Gemini API key not found', 'AI search disabled');
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    log.success('AI Search initialized', 'Ready for intelligent queries');
    return true;
  } catch (error: any) {
    log.error('Failed to initialize AI Search', error.message);
    return false;
  }
}

export interface SearchResult {
  messageId: string;
  sender: string;
  chatName: string;
  content: string;
  timestamp: string;
  relevanceScore: number;
  matchReason: string;
  // ── Media-aware fields ──────────────────────────────────────────────────
  mediaType?: string | null;       // 'image' | 'video' | 'audio' | 'document' | 'sticker' | null
  messageKey?: string | null;      // For media download via /api/whatsapp/media/:key
  hasMedia?: boolean;              // Quick check flag
  documentName?: string | null;    // Original filename for documents
  imageDescription?: string | null; // Gemini Vision description for images
  documentSummary?: string | null; // Gemini summary for documents
  extractedInfo?: {
    people?: string[];
    dates?: string[];
    topics?: string[];
    actionItems?: string[];
  };
}

export interface AISearchResponse {
  query: string;
  answer: string;
  results: SearchResult[];
  summary: string;
  suggestedFollowUps?: string[];
}

interface MessageData {
  id: string;
  sender: string;
  chat_name: string | null;
  content: string;
  timestamp: string;
  classification?: string | null;
  metadata?: any;
}

/**
 * Search messages using AI understanding
 * The AI analyzes the query and finds relevant messages, extracting key information
 */
export async function aiSearch(
  query: string,
  messages: MessageData[],
  userId?: string
): Promise<AISearchResponse> {
  if (!model) {
    initSearchAI();
  }

  if (!model) {
    // Fallback to basic keyword search if AI not available
    return fallbackSearch(query, messages);
  }

  // ── Cache check ──────────────────────────────────────────────────────────
  const ck = cacheKey(query, messages.length);
  const cached = getCached(ck);
  if (cached) {
    log.info('AI Search (cache hit)', `"${query.slice(0, 40)}"`);
    return cached;
  }

  try {
    // ── Pre-filter: pick the 60 most keyword-relevant messages ────────────
    const candidateMessages = preFilterMessages(query, messages, 60);
    if (candidateMessages.length === 0) return fallbackSearch(query, messages);

    // ── Truncate content to 150 chars each — cuts tokens dramatically ─────
    // Append media metadata summary for AI context
    const messageContext = candidateMessages.map((m, i) => {
      let line = `[${i}] ${m.sender}|${m.chat_name || '?'}|${m.timestamp.slice(0, 10)}`;
      // Add media type indicator
      const mediaType = m.metadata?.mediaType;
      if (mediaType) line += `|[${mediaType.toUpperCase()}]`;
      line += `\n${m.content.slice(0, 150)}`;
      // Append image description if present and not already in content
      if (m.metadata?.imageAnalysis?.description) {
        line += `\n[Image: ${m.metadata.imageAnalysis.description.slice(0, 100)}]`;
      }
      // Append document info if present
      if (m.metadata?.document?.fileName) {
        line += `\n[File: ${m.metadata.document.fileName}]`;
      }
      if (m.metadata?.documentAnalysis?.summary) {
        line += `\n[Doc summary: ${m.metadata.documentAnalysis.summary.slice(0, 100)}]`;
      }
      return line;
    }).join('\n---\n');

    const prompt = `You are a search assistant for WhatsApp messages. Messages can include text, images (with AI-generated descriptions and OCR text), documents (with summaries and extracted text), videos, and audio files.

QUERY: "${query}"

MESSAGES (${candidateMessages.length} most relevant):
${messageContext}

Analyze the query and find ALL relevant messages. For queries about specific topics, media, files, or interactions with people, find ALL related messages including images and documents whose descriptions or contents match.

When the user searches for a topic (e.g. "DSA", "math", "notes"), also match:
- Images that were analyzed and contain relevant content (marked with [Image:])
- Documents/files related to the topic (marked with [File:] or [Doc summary:])
- Text messages discussing the topic

Respond in this exact JSON format:
{
  "answer": "A natural language answer to the user's query summarizing what you found",
  "matchingMessageIndices": [list of message indices [0, 1, 2...] that match the query],
  "matchReasons": {"0": "reason why message 0 matches", "1": "reason why message 1 matches"},
  "summary": "Brief summary of findings",
  "extractedInfo": {
    "people": ["names of people mentioned"],
    "dates": ["any dates/times mentioned"],
    "topics": ["key topics discussed"],
    "actionItems": ["any action items or tasks found"]
  },
  "suggestedFollowUps": ["suggested follow-up questions the user might ask"]
}

Be thorough - if the user asks about meetings with someone, find ALL messages mentioning that person or related discussions. If the user asks about a topic, include images and documents that contain that topic.`;

    const result = await model.generateContent(prompt);
    const geminiResponse = await result.response;
    const text = geminiResponse.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warning('AI Search: Could not parse response', 'Falling back to basic search');
      return fallbackSearch(query, messages);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Build search results from matching indices
    const results: SearchResult[] = (parsed.matchingMessageIndices || [])
      .filter((i: number) => i >= 0 && i < candidateMessages.length)
      .map((i: number) => {
        const msg = candidateMessages[i];
        const meta = msg.metadata;
        const mediaType = meta?.mediaType || null;
        const messageKey = meta?.messageKey || null;
        return {
          messageId: msg.id,
          sender: msg.sender,
          chatName: msg.chat_name || 'Unknown',
          content: msg.content,           // Return full content in results
          timestamp: msg.timestamp,
          relevanceScore: 1 - (i * 0.01),
          matchReason: parsed.matchReasons?.[String(i)] || 'Matches query',
          extractedInfo: parsed.extractedInfo,
          // Media-aware fields
          mediaType,
          messageKey,
          hasMedia: !!mediaType,
          documentName: meta?.document?.fileName || null,
          imageDescription: meta?.imageAnalysis?.description || null,
          documentSummary: meta?.documentAnalysis?.summary || null,
        };
      });

    log.info('AI Search completed',
      `Found ${results.length} results for: "${query}" (pre-filtered ${messages.length}→${candidateMessages.length})`);

    const response: AISearchResponse = {
      query,
      answer: parsed.answer || 'No specific answer found.',
      results,
      summary: parsed.summary || `Found ${results.length} matching messages.`,
      suggestedFollowUps: parsed.suggestedFollowUps || [],
    };

    setCached(ck, response);
    return response;

  } catch (error: any) {
    log.error('AI Search failed', error.message);
    return fallbackSearch(query, messages);
  }
}

/**
 * Fallback keyword-based search when AI is not available
 */
function fallbackSearch(query: string, messages: MessageData[]): AISearchResponse {
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/).filter(k => k.length > 2);

  const results: SearchResult[] = messages
    .filter(msg => {
      const content = msg.content.toLowerCase();
      const sender = msg.sender.toLowerCase();
      const chatName = (msg.chat_name || '').toLowerCase();
      // Also search through metadata fields
      const meta = msg.metadata;
      const imgDesc = (meta?.imageAnalysis?.description || '').toLowerCase();
      const imgText = (meta?.imageAnalysis?.extractedText || '').toLowerCase();
      const docName = (meta?.document?.fileName || '').toLowerCase();
      const docSummary = (meta?.documentAnalysis?.summary || '').toLowerCase();
      const docText = (meta?.documentAnalysis?.extractedText || '').toLowerCase();
      
      return keywords.some(kw => 
        content.includes(kw) || 
        sender.includes(kw) || 
        chatName.includes(kw) ||
        imgDesc.includes(kw) ||
        imgText.includes(kw) ||
        docName.includes(kw) ||
        docSummary.includes(kw) ||
        docText.includes(kw)
      );
    })
    .slice(0, 50)
    .map((msg, i) => {
      const meta = msg.metadata;
      const mediaType = meta?.mediaType || null;
      return {
        messageId: msg.id,
        sender: msg.sender,
        chatName: msg.chat_name || 'Unknown',
        content: msg.content,
        timestamp: msg.timestamp,
        relevanceScore: 1 - (i * 0.02),
        matchReason: 'Contains matching keywords',
        mediaType,
        messageKey: meta?.messageKey || null,
        hasMedia: !!mediaType,
        documentName: meta?.document?.fileName || null,
        imageDescription: meta?.imageAnalysis?.description || null,
        documentSummary: meta?.documentAnalysis?.summary || null,
      };
    });

  return {
    query,
    answer: results.length > 0 
      ? `Found ${results.length} messages matching your search.`
      : 'No messages found matching your search.',
    results,
    summary: `Keyword search found ${results.length} results.`
  };
}

/**
 * Get AI-generated summary of conversations with a specific person
 */
export async function getConversationSummary(
  personName: string,
  messages: MessageData[]
): Promise<string> {
  if (!model) {
    initSearchAI();
  }

  if (!model) {
    return `Unable to generate summary - AI not available. Found ${messages.length} messages with ${personName}.`;
  }

  try {
    const relevantMessages = messages
      .filter(m => 
        m.sender.toLowerCase().includes(personName.toLowerCase()) ||
        m.content.toLowerCase().includes(personName.toLowerCase())
      )
      .slice(0, 100);

    if (relevantMessages.length === 0) {
      return `No conversations found with ${personName}.`;
    }

    const messageContext = relevantMessages.map(m => 
      `[${m.timestamp}] ${m.sender}: ${m.content}`
    ).join('\n');

    const prompt = `Summarize the key points from these conversations involving "${personName}":

${messageContext}

Provide a concise summary including:
1. Main topics discussed
2. Any meetings, calls, or appointments mentioned
3. Action items or tasks
4. Important dates or deadlines
5. Overall relationship context`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();

  } catch (error: any) {
    log.error('Conversation summary failed', error.message);
    return `Error generating summary: ${error.message}`;
  }
}
