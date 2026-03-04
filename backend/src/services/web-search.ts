/**
 * Web Search Service — Gemini-powered Google Search grounding
 *
 * Uses Gemini's native Google Search grounding tool so we get real-time
 * web results with citations without a separate Search API key.
 * Falls back to DuckDuckGo instant-answer API if grounding is unavailable.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import log from './activity-log';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

export interface WebSearchResult {
  title:   string;
  snippet: string;
  url:     string;
  source?: string;
}

export interface WebSearchResponse {
  query:          string;
  answer:         string;
  results:        WebSearchResult[];
  groundingUsed:  boolean;
}

let genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
  if (!genAI && GEMINI_API_KEY) genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI;
}

/**
 * Detect if a query needs live web information.
 * Returns true for questions about current events, prices, recent news, etc.
 */
export function needsWebSearch(query: string): boolean {
  const q = query.toLowerCase();

  // Explicit web search triggers
  if (/\b(search\s+(the\s+)?web|google|look\s+up|find\s+online|browse)\b/.test(q)) return true;

  // Current/live information
  if (/\b(latest|current|today'?s?|right\s+now|live|real[-\s]?time)\b/.test(q) &&
      /\b(news|price|stock|weather|rate|score|result|update)\b/.test(q)) return true;

  // Recent events / news
  if (/\b(recent|breaking|new[s\s]|(what|who)\s+is|who\s+won|what\s+happened|news\s+about)\b/.test(q) &&
      !/\b(message|chat|whatsapp|gmail|inbox)\b/.test(q)) return true;

  // Factual lookup (not about the user's messages)
  if (/^(what|who|when|where|how|why)\s+(is|are|was|were|does|did|has|have)\b/.test(q) &&
      !/\b(message|send|sent|receive|inbox|chat|whatsapp)\b/.test(q) &&
      q.length < 120) return true;

  return false;
}

/**
 * Run a web search using Gemini grounding.
 * Returns structured results with citations.
 */
export async function webSearch(query: string): Promise<WebSearchResponse> {
  const ai = getGenAI();
  if (!ai) {
    return { query, answer: 'Web search unavailable (no API key).', results: [], groundingUsed: false };
  }

  try {
    // Gemini 2.0 Flash supports Google Search grounding natively
    const model = ai.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ googleSearch: {} }] as any,
    });

    const prompt = `Answer this question using up-to-date web information: "${query}"

Provide:
1. A clear, direct answer
2. Key facts with sources

Be concise. Today is ${new Date().toDateString()}.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Extract grounding metadata (citations)
    const groundingMeta = (response as any).candidates?.[0]?.groundingMetadata;
    const chunks: any[] = groundingMeta?.groundingChunks || [];
    const supports: any[] = groundingMeta?.groundingSupports || [];

    const results: WebSearchResult[] = chunks
      .filter(c => c.web?.uri && c.web?.title)
      .slice(0, 6)
      .map(c => ({
        title:   c.web.title,
        snippet: supports.find(s =>
          s.groundingChunkIndices?.includes(chunks.indexOf(c))
        )?.segment?.text || '',
        url:     c.web.uri,
        source:  new URL(c.web.uri).hostname,
      }));

    log.info('Web search (Gemini grounding)', `query="${query.slice(0, 50)}" sources=${results.length}`);

    return { query, answer: text, results, groundingUsed: chunks.length > 0 };

  } catch (err: any) {
    log.warning('Gemini grounding failed, trying DuckDuckGo', err.message);
    return fallbackDuckDuckGo(query);
  }
}

/**
 * Fallback: DuckDuckGo Instant Answer API (no key needed, limited results)
 */
async function fallbackDuckDuckGo(query: string): Promise<WebSearchResponse> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`DDG ${res.status}`);
    const data: any = await res.json();

    const answer = data.AbstractText || data.Answer || data.Definition || '';
    const results: WebSearchResult[] = [];

    if (data.AbstractURL) {
      results.push({
        title:   data.Heading || query,
        snippet: data.AbstractText || '',
        url:     data.AbstractURL,
        source:  data.AbstractSource,
      });
    }

    // Related topics
    for (const topic of (data.RelatedTopics || []).slice(0, 4)) {
      if (topic.FirstURL && topic.Text) {
        results.push({
          title:   topic.Text.slice(0, 80),
          snippet: topic.Text,
          url:     topic.FirstURL,
        });
      }
    }

    return { query, answer: answer || `Search results for: ${query}`, results, groundingUsed: false };

  } catch (err: any) {
    log.error('DuckDuckGo fallback failed', err.message);
    return { query, answer: 'Web search temporarily unavailable.', results: [], groundingUsed: false };
  }
}
