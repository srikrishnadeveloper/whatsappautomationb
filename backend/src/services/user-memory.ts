/**
 * User Memory Service — Persistent long-term memory for AI chat
 *
 * Stores facts about the user across sessions so Mindline AI remembers them
 * just like ChatGPT's memory feature. Examples:
 *  - "user_name": "Alice"
 *  - "user_language": "Hindi"
 *  - "preference_response_style": "concise"
 *  - "context_timezone": "Asia/Kolkata"
 *  - "fact_has_dog": "yes, golden retriever named Max"
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../config/supabase';
import log from './activity-log';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

export interface MemoryFact {
  id?:        string;
  key:        string;
  value:      string;
  confidence: number;
  source:     'chat' | 'explicit' | 'inferred';
  updatedAt?: string;
}

type MemoryMap = Record<string, MemoryFact>;

// In-memory cache: userId → { key → MemoryFact }
const memoryCache = new Map<string, MemoryMap>();
// Track when each user's cache was last loaded
const memoryCacheTs = new Map<string, number>();
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

// ── Read ───────────────────────────────────────────────────────────────────

export async function getUserMemory(userId: string): Promise<MemoryMap> {
  const now = Date.now();
  const ts = memoryCacheTs.get(userId) || 0;
  if (memoryCache.has(userId) && now - ts < CACHE_TTL_MS) {
    return memoryCache.get(userId)!;
  }

  if (!supabase) return {};

  try {
    const { data } = await supabase
      .from('user_memory')
      .select('id, key, value, confidence, source, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(100);

    const map: MemoryMap = {};
    for (const row of data || []) {
      map[row.key] = {
        id:         row.id,
        key:        row.key,
        value:      row.value,
        confidence: row.confidence ?? 1.0,
        source:     row.source || 'chat',
        updatedAt:  row.updated_at,
      };
    }
    memoryCache.set(userId, map);
    memoryCacheTs.set(userId, now);
    return map;
  } catch (err: any) {
    log.error('getUserMemory failed', err.message);
    return {};
  }
}

/** Format memory as a compact context string for injection into AI prompts */
export function formatMemoryForPrompt(memory: MemoryMap): string {
  const facts = Object.values(memory);
  if (facts.length === 0) return '';
  const lines = facts
    .filter(f => f.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20)
    .map(f => `  • ${f.key.replace(/_/g, ' ')}: ${f.value}`);
  return lines.join('\n');
}

// ── Write ──────────────────────────────────────────────────────────────────

export async function setMemoryFact(
  userId: string,
  key: string,
  value: string,
  confidence = 1.0,
  source: MemoryFact['source'] = 'chat',
): Promise<void> {
  // Update cache immediately
  const cache = memoryCache.get(userId) || {};
  cache[key] = { key, value, confidence, source };
  memoryCache.set(userId, cache);

  if (!supabase) return;
  try {
    const now = new Date().toISOString();
    await supabase.from('user_memory').upsert(
      { user_id: userId, key, value, confidence, source, updated_at: now },
      { onConflict: 'user_id,key' },
    );
  } catch (err: any) {
    log.error('setMemoryFact failed', err.message);
  }
}

export async function deleteMemoryFact(userId: string, key: string): Promise<void> {
  const cache = memoryCache.get(userId) || {};
  delete cache[key];
  memoryCache.set(userId, cache);

  if (!supabase) return;
  try {
    await supabase.from('user_memory').delete()
      .eq('user_id', userId).eq('key', key);
  } catch (err: any) {
    log.error('deleteMemoryFact failed', err.message);
  }
}

export async function clearAllMemory(userId: string): Promise<void> {
  memoryCache.delete(userId);
  memoryCacheTs.delete(userId);
  if (!supabase) return;
  try {
    await supabase.from('user_memory').delete().eq('user_id', userId);
  } catch (err: any) {
    log.error('clearAllMemory failed', err.message);
  }
}

// ── AI-powered memory extraction ───────────────────────────────────────────

let genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
  if (!genAI && GEMINI_API_KEY) genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI;
}

/**
 * Extract new memory facts from a user message + AI reply pair.
 * Runs asynchronously in the background — does NOT block the response.
 */
export async function extractAndStoreMemory(
  userId:    string,
  userMsg:   string,
  aiReply:   string,
): Promise<void> {
  const ai = getGenAI();
  if (!ai) return;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const prompt = `You are extracting user facts from a conversation turn to remember for future chats.

USER said: "${userMsg.slice(0, 500)}"
AI replied: "${aiReply.slice(0, 300)}"

Extract ONLY concrete, stable facts about the USER (not about their messages).
Examples of good facts: user's name, language preference, timezone, topics they care about, their profession, their preferences.
Skip: questions, temporary requests, message content queries.

Return JSON array (empty [] if nothing useful):
[{"key": "snake_case_key", "value": "fact value", "confidence": 0.0-1.0}]

Examples:
- "My name is Priya" → [{"key":"user_name","value":"Priya","confidence":1.0}]
- "I'm in India" → [{"key":"user_location","value":"India","confidence":0.9}]
- "Reply in Hindi please" → [{"key":"preference_language","value":"Hindi","confidence":1.0}]
- "What did John send?" → []   (not a user fact)`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;
    const facts: Array<{ key: string; value: string; confidence: number }> = JSON.parse(match[0]);

    for (const f of facts) {
      if (f.key && f.value && typeof f.confidence === 'number' && f.confidence >= 0.7) {
        await setMemoryFact(userId, f.key, String(f.value), f.confidence, 'chat');
      }
    }

    if (facts.length > 0) {
      log.info('Memory extracted', `user=${userId} facts=${facts.map(f => f.key).join(', ')}`);
    }
  } catch {
    // Silent — memory extraction is best-effort
  }
}

/**
 * Handle explicit memory commands: "remember that...", "forget ...", "what do you remember"
 * Returns a string response if the message was a memory command, null otherwise.
 */
export async function handleMemoryCommand(
  userId:  string,
  message: string,
): Promise<string | null> {
  const q = message.toLowerCase().trim();

  // "what do you remember about me" / "what do you know about me"
  if (/\b(what\s+do\s+you\s+remember|what\s+you\s+know|your\s+memory|show\s+memory|recall)\b/.test(q)) {
    const memory = await getUserMemory(userId);
    const facts = Object.values(memory);
    if (facts.length === 0) return "I don't have any memories stored about you yet. As we chat, I'll start remembering things you tell me!";
    const lines = facts
      .filter(f => f.confidence >= 0.6)
      .sort((a, b) => b.confidence - a.confidence)
      .map(f => `• **${f.key.replace(/_/g, ' ')}**: ${f.value}`)
      .join('\n');
    return `Here's what I remember about you:\n\n${lines}`;
  }

  // "remember that / always remember / don't forget"
  const rememberMatch = message.match(/\b(?:remember\s+that|always\s+remember|please\s+remember|note\s+that)\s+(.+)/i);
  if (rememberMatch) {
    const fact = rememberMatch[1].trim();
    // Generate a key from the fact
    const ai = getGenAI();
    if (ai) {
      try {
        const model = ai.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
        const result = await model.generateContent(
          `Convert this memory to a key-value pair. Return ONLY JSON {"key":"snake_case","value":"string"}.\nFact: "${fact}"`
        );
        const kv = JSON.parse(result.response.text().match(/\{[^}]+\}/)![0]);
        await setMemoryFact(userId, kv.key, kv.value, 1.0, 'explicit');
        return `Got it! I'll remember: **${kv.key.replace(/_/g, ' ')}** → ${kv.value}`;
      } catch {}
    }
    await setMemoryFact(userId, `explicit_${Date.now()}`, fact, 1.0, 'explicit');
    return `Got it! I'll remember that.`;
  }

  // "forget / don't remember / clear memory / reset memory"
  if (/\b(forget\s+everything|clear\s+(my\s+)?memory|reset\s+memory|delete\s+memory)\b/.test(q)) {
    await clearAllMemory(userId);
    return "Done — I've cleared everything I knew about you.";
  }

  // "forget that I ..."
  const forgetMatch = message.match(/\bforget\s+(?:that\s+)?(.+)/i);
  if (forgetMatch && !/everything|all/.test(forgetMatch[1])) {
    return `I'll try to forget that. (Tip: use **"clear my memory"** to reset everything.)`;
  }

  return null;
}
