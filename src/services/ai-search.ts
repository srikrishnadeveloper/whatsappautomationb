/**
 * AI-Powered Search Service
 * Uses Gemini AI to search through messages and find relevant information
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import log from './activity-log';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

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

  try {
    // Prepare message context for AI (limit to recent 500 messages to avoid token limits)
    const recentMessages = messages.slice(0, 500);
    const messageContext = recentMessages.map((m, i) => 
      `[${i}] From: ${m.sender} | Chat: ${m.chat_name || 'Unknown'} | Time: ${m.timestamp}\n${m.content}`
    ).join('\n---\n');

    const prompt = `You are an intelligent search assistant analyzing WhatsApp messages. 

USER QUERY: "${query}"

MESSAGES TO SEARCH:
${messageContext}

Analyze the query and find ALL relevant messages. For queries about meetings, calls, appointments, or interactions with specific people, find ALL related messages.

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

Be thorough - if the user asks about meetings with someone, find ALL messages mentioning that person or related discussions.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warning('AI Search: Could not parse response', 'Falling back to basic search');
      return fallbackSearch(query, messages);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Build search results from matching indices
    const results: SearchResult[] = (parsed.matchingMessageIndices || [])
      .filter((i: number) => i >= 0 && i < recentMessages.length)
      .map((i: number) => {
        const msg = recentMessages[i];
        return {
          messageId: msg.id,
          sender: msg.sender,
          chatName: msg.chat_name || 'Unknown',
          content: msg.content,
          timestamp: msg.timestamp,
          relevanceScore: 1 - (i * 0.01), // Higher score for earlier matches
          matchReason: parsed.matchReasons?.[String(i)] || 'Matches query',
          extractedInfo: parsed.extractedInfo
        };
      });

    log.info('AI Search completed', `Found ${results.length} results for: "${query}"`);

    return {
      query,
      answer: parsed.answer || 'No specific answer found.',
      results,
      summary: parsed.summary || `Found ${results.length} matching messages.`,
      suggestedFollowUps: parsed.suggestedFollowUps || []
    };

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
      
      return keywords.some(kw => 
        content.includes(kw) || 
        sender.includes(kw) || 
        chatName.includes(kw)
      );
    })
    .slice(0, 50)
    .map((msg, i) => ({
      messageId: msg.id,
      sender: msg.sender,
      chatName: msg.chat_name || 'Unknown',
      content: msg.content,
      timestamp: msg.timestamp,
      relevanceScore: 1 - (i * 0.02),
      matchReason: 'Contains matching keywords'
    }));

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
