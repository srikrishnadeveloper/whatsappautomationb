/**
 * Gemini AI Classifier — Production Grade
 * Uses enhanced rule-based pre-filtering + Google Gemini for uncertain cases.
 * Goal: 60-70% of messages handled by rules alone, minimising AI API calls.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import log from './activity-log';
import { classifyMessage as ruleBasedClassify, makeDecision } from '../classifier/rule-based';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

// Stats tracking
let aiCallCount = 0;
let ruleOnlyCount = 0;

// Initialize Gemini
export function initGemini() {
  if (!GEMINI_API_KEY) {
    log.warning('Gemini API key not found', 'Using rule-based classification only');
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    log.success('Gemini AI initialized', 'Using gemini-2.0-flash');
    return true;
  } catch (error: any) {
    log.error('Failed to initialize Gemini', error.message);
    return false;
  }
}

// Action item extracted by AI
export interface ExtractedActionItem {
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  type: 'meeting' | 'deadline' | 'reminder' | 'task' | 'followup' | 'call' | 'other';
  assignee?: string;
}

// Classification result
export interface ClassificationResult {
  category: 'work' | 'study' | 'personal' | 'urgent' | 'casual' | 'spam';
  priority: 'high' | 'medium' | 'low' | 'none';
  decision: 'create' | 'review' | 'ignore';
  reasoning: string;
  suggestedTask?: string;
  deadline?: string;
  actionItems?: ExtractedActionItem[];
}

// ============================================
// ENHANCED AI PROMPT (token-optimised)
// ============================================

function buildPrompt(content: string, sender: string): string {
  return `Classify this WhatsApp message and extract action items.

FROM: ${sender}
MSG: ${content}

Return ONLY JSON:
{
  "category": "work|study|personal|urgent|casual|spam",
  "priority": "high|medium|low|none",
  "decision": "create|review|ignore",
  "reasoning": "1 sentence why",
  "suggestedTask": "task title or null",
  "deadline": "extracted deadline string or null",
  "actionItems": [{"title":"...","description":"...","dueDate":"YYYY-MM-DD","dueTime":"HH:MM","priority":"urgent|high|medium|low","type":"meeting|deadline|reminder|task|followup|call|other","assignee":"..."}]
}

Rules:
- work = meetings, reports, deadlines, professional, client
- study = exams, assignments, lectures, academic
- personal = errands, reminders, appointments, health, bills
- urgent = ASAP/emergency/critical/same-day
- casual = greetings, jokes, memes, social chat
- spam = promotions, forwarded chains, marketing
- decision: "create" if actionable, "review" if uncertain, "ignore" if casual/spam
- Extract EVERY actionable item (meetings, deadlines, calls, reminders, tasks)
- Multiple actions in one message = multiple items in array
- If no actions, return empty actionItems array`;
}

// ============================================
// HYBRID CLASSIFY — rules first, AI only when needed
// ============================================

export async function classifyWithAI(content: string, sender: string): Promise<ClassificationResult> {
  // ---- STEP 1: Enhanced rule-based pre-filter ----
  const ruleResult = ruleBasedClassify(content);
  const decision = makeDecision(ruleResult, content.length);

  // Map enhanced rule-based categories to service categories
  const categoryMap: Record<string, ClassificationResult['category']> = {
    'work': 'work',
    'study': 'study',
    'personal': 'personal',
    'ignore': 'casual',
  };

  const priorityMap: Record<string, ClassificationResult['priority']> = {
    'urgent': 'high',
    'high': 'high',
    'medium': 'medium',
    'low': 'low',
  };

  // If rule-based is confident enough (≥ 0.80), skip AI entirely
  if (ruleResult.confidence >= 0.80) {
    ruleOnlyCount++;
    const mappedCategory = categoryMap[ruleResult.category] || 'casual';
    const mappedPriority = priorityMap[ruleResult.priority] || 'low';

    log.info('Rule-based classification', 
      `${mappedCategory} | ${mappedPriority} | ${decision} | confidence=${ruleResult.confidence.toFixed(2)} [${ruleResult.keywords_matched.join(', ')}]`);

    return {
      category: mappedCategory,
      priority: decision === 'ignore' ? 'none' : mappedPriority,
      decision,
      reasoning: `Rule-based (${ruleResult.confidence.toFixed(2)}): matched [${ruleResult.keywords_matched.slice(0, 5).join(', ')}]`,
      suggestedTask: decision === 'create' ? content.slice(0, 80) : undefined,
      deadline: ruleResult.has_deadline ? 'detected' : undefined,
      actionItems: [],
    };
  }

  // Short messages (< 20 chars) — rules are enough, don't waste AI tokens
  if (content.length < 20) {
    ruleOnlyCount++;
    return {
      category: categoryMap[ruleResult.category] || 'casual',
      priority: decision === 'ignore' ? 'none' : (priorityMap[ruleResult.priority] || 'low'),
      decision,
      reasoning: `Rule-based (short message, ${ruleResult.confidence.toFixed(2)})`,
      actionItems: [],
    };
  }

  // Media-only messages — skip AI
  if (content === '[Media/No Content]' || content === '[Media]') {
    ruleOnlyCount++;
    return {
      category: 'casual',
      priority: 'none',
      decision: 'review',
      reasoning: 'Media message without text',
      actionItems: [],
    };
  }

  // ---- STEP 2: Call AI for uncertain cases ----
  if (!model) {
    // No AI available — use rule result as-is
    ruleOnlyCount++;
    return {
      category: categoryMap[ruleResult.category] || 'personal',
      priority: priorityMap[ruleResult.priority] || 'low',
      decision,
      reasoning: `Rule-based fallback (no AI): ${ruleResult.keywords_matched.join(', ')}`,
      actionItems: [],
    };
  }

  try {
    aiCallCount++;
    const prompt = buildPrompt(content, sender);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      const actionItemCount = parsed.actionItems?.length || 0;
      log.info('AI Classification', 
        `${parsed.category} | ${parsed.priority} | ${parsed.decision} | ${actionItemCount} actions [AI call #${aiCallCount}]`);
      
      return {
        category: parsed.category || 'casual',
        priority: parsed.priority || 'low',
        decision: parsed.decision || 'review',
        reasoning: parsed.reasoning || 'AI classified',
        suggestedTask: parsed.suggestedTask,
        deadline: parsed.deadline,
        actionItems: parsed.actionItems || [],
      };
    }
  } catch (error: any) {
    log.warning('AI classification failed', error.message);
  }

  // ---- STEP 3: Fallback to rules if AI fails ----
  ruleOnlyCount++;
  return {
    category: categoryMap[ruleResult.category] || 'personal',
    priority: priorityMap[ruleResult.priority] || 'low',
    decision,
    reasoning: `Rule-based fallback (AI failed): ${ruleResult.keywords_matched.join(', ')}`,
    actionItems: [],
  };
}

// Pure rule-based classification (for use when AI is explicitly unwanted)
export function classifyWithRules(content: string): ClassificationResult {
  const ruleResult = ruleBasedClassify(content);
  const decision = makeDecision(ruleResult, content.length);

  const categoryMap: Record<string, ClassificationResult['category']> = {
    'work': 'work', 'study': 'study', 'personal': 'personal', 'ignore': 'casual',
  };
  const priorityMap: Record<string, ClassificationResult['priority']> = {
    'urgent': 'high', 'high': 'high', 'medium': 'medium', 'low': 'low',
  };

  return {
    category: categoryMap[ruleResult.category] || 'casual',
    priority: decision === 'ignore' ? 'none' : (priorityMap[ruleResult.priority] || 'low'),
    decision,
    reasoning: `Rule-based (${ruleResult.confidence.toFixed(2)}): [${ruleResult.keywords_matched.join(', ')}]`,
    suggestedTask: decision === 'create' ? content.slice(0, 80) : undefined,
    actionItems: [],
  };
}

// Get classifier stats
export function getClassifierStats() {
  return { aiCalls: aiCallCount, ruleOnly: ruleOnlyCount, total: aiCallCount + ruleOnlyCount };
}

export default { initGemini, classifyWithAI, classifyWithRules, getClassifierStats };
