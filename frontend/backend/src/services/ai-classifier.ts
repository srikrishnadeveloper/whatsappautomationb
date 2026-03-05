/**
 * Gemini AI Classifier
 * Uses Google's Gemini API to classify WhatsApp messages
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import log from './activity-log';
import { initMLClassifier, classifyWithML, isMLClassifierReady, getMLClassifierStatus } from '../classifier/ml';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

// Stats tracking
let mlCallCount = 0;

// Initialize Gemini
export function initGemini() {
  if (!GEMINI_API_KEY) {
    log.warning('Gemini API key not found', 'Using rule-based classification');
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    log.success('Gemini AI initialized', 'Using gemini-3-flash-preview');
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

// Classify message with AI
export async function classifyWithAI(content: string, sender: string): Promise<ClassificationResult> {
  // ---- STEP 1: Try ML classifier (free, fast, ~97% accuracy) ----
  if (isMLClassifierReady()) {
    const mlResult = classifyWithML(content);
    if (mlResult && mlResult.confidence >= 0.65) {
      mlCallCount++;
      const categoryMap: Record<string, ClassificationResult['category']> = {
        'work': 'work', 'study': 'study', 'personal': 'personal', 'ignore': 'casual',
      };
      const priorityMap: Record<string, ClassificationResult['priority']> = {
        'urgent': 'high', 'high': 'high', 'medium': 'medium', 'low': 'low',
      };
      const mlCategory = categoryMap[mlResult.category] || 'casual';
      const mlPriority = priorityMap[mlResult.priority] || 'low';
      const mlDecision = mlResult.has_action_verb || mlResult.has_deadline
        ? 'create' as const
        : mlResult.confidence >= 0.8
          ? (mlResult.category === 'ignore' ? 'ignore' as const : 'create' as const)
          : 'review' as const;

      log.info('ML Classification',
        `${mlCategory} | ${mlPriority} | ${mlDecision} | conf=${mlResult.confidence.toFixed(2)} | ${mlResult.inference_time_ms}ms [ML #${mlCallCount}]`);

      return {
        category: mlCategory,
        priority: mlDecision === 'ignore' ? 'none' : mlPriority,
        decision: mlDecision,
        reasoning: `ML model (${mlResult.confidence.toFixed(2)}): ${mlResult.keywords_matched.slice(0, 5).join(', ') || 'pattern match'}`,
        suggestedTask: mlDecision === 'create' ? content.slice(0, 80) : undefined,
        deadline: mlResult.has_deadline ? 'detected' : undefined,
        actionItems: [],
      };
    }
  }

  // ---- STEP 2: If no AI available, use ML or rule-based ----
  if (!model) {
    // Try ML fallback if it didn't pass confidence threshold above
    if (isMLClassifierReady()) {
      const mlFallback = classifyWithML(content);
      if (mlFallback) {
        mlCallCount++;
        return {
          category: mlFallback.category === 'ignore' ? 'casual' : mlFallback.category as any,
          priority: 'low',
          decision: 'review',
          reasoning: `ML fallback (no Gemini, conf=${mlFallback.confidence.toFixed(2)})`,
          actionItems: [],
        };
      }
    }
    return classifyWithRules(content);
  }

  try {
    const prompt = `You are an intelligent WhatsApp message analyzer. Your job is to:
1. Classify the message
2. Extract ALL actionable items as tasks

MESSAGE FROM: ${sender}
MESSAGE: ${content}

Respond with ONLY valid JSON in this exact format:
{
  "category": "work|study|personal|urgent|casual|spam",
  "priority": "high|medium|low|none",
  "decision": "create|review|ignore",
  "reasoning": "brief explanation",
  "suggestedTask": "main task title if actionable",
  "deadline": "extracted deadline if any (e.g., 'tomorrow 3pm', 'EOD', 'Jan 5')",
  "actionItems": [
    {
      "title": "concise action item title",
      "description": "more context if needed",
      "dueDate": "YYYY-MM-DD if determinable",
      "dueTime": "HH:MM if determinable",
      "priority": "urgent|high|medium|low",
      "type": "meeting|deadline|reminder|task|followup|call|other",
      "assignee": "person mentioned if any"
    }
  ]
}

Classification rules:
- work: meetings, reports, deadlines, professional tasks, client work
- study: exams, assignments, lectures, academic content
- personal: personal tasks, reminders, appointments, health
- urgent: ASAP, immediately, emergency, critical, same-day deadlines
- casual: greetings, memes, jokes, casual chat
- spam: promotions, spam, irrelevant content

Action item extraction rules:
- Extract EVERY actionable thing mentioned
- "Meeting tomorrow at 3pm" → meeting action item
- "Please review and send by EOD" → deadline action item
- "Don't forget to call John" → call action item
- "Remind me about..." → reminder action item
- Multiple items in one message = multiple action items

decision rules:
- create: has actionable items (set decision to "create")
- review: unclear if actionable
- ignore: casual/spam with no actions needed`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      const actionItemCount = parsed.actionItems?.length || 0;
      log.info('AI Classification', 
        `${parsed.category} | ${parsed.priority} | ${parsed.decision} | ${actionItemCount} action items`);
      
      return {
        category: parsed.category || 'casual',
        priority: parsed.priority || 'low',
        decision: parsed.decision || 'review',
        reasoning: parsed.reasoning || 'AI classified',
        suggestedTask: parsed.suggestedTask,
        deadline: parsed.deadline,
        actionItems: parsed.actionItems || []
      };
    }
  } catch (error: any) {
    log.warning('AI classification failed', error.message);
  }

  // Fallback to rules
  return classifyWithRules(content);
}

// Rule-based classification (fallback)
export function classifyWithRules(content: string): ClassificationResult {
  const lowerContent = content.toLowerCase();

  // Urgent patterns
  const urgentPatterns = ['urgent', 'asap', 'immediately', 'emergency', 'critical'];
  for (const pattern of urgentPatterns) {
    if (lowerContent.includes(pattern)) {
      return {
        category: 'urgent',
        priority: 'high',
        decision: 'create',
        reasoning: `Contains urgent keyword: ${pattern}`
      };
    }
  }

  // Work keywords
  const workKeywords = ['meeting', 'deadline', 'report', 'project', 'task', 'work', 'office', 
    'client', 'presentation', 'submit', 'review', 'eod', 'tomorrow', 'schedule'];
  for (const keyword of workKeywords) {
    if (lowerContent.includes(keyword)) {
      return {
        category: 'work',
        priority: 'medium',
        decision: 'create',
        reasoning: `Matched work keyword: ${keyword}`
      };
    }
  }

  // Study keywords
  const studyKeywords = ['exam', 'study', 'assignment', 'homework', 'class', 'lecture', 
    'test', 'quiz', 'professor', 'library', 'chapter', 'notes'];
  for (const keyword of studyKeywords) {
    if (lowerContent.includes(keyword)) {
      return {
        category: 'study',
        priority: 'medium',
        decision: 'create',
        reasoning: `Matched study keyword: ${keyword}`
      };
    }
  }

  // Casual/ignore patterns
  const casualPatterns = ['lol', 'haha', '😂', '🤣', 'meme', 'funny', 'joke', 'good morning', 
    'good night', 'gm', 'gn', 'hi', 'hello', 'bye', 'ok', 'okay', 'sure', 'thanks'];
  for (const pattern of casualPatterns) {
    if (lowerContent.includes(pattern)) {
      return {
        category: 'casual',
        priority: 'none',
        decision: 'ignore',
        reasoning: `Matched casual pattern: ${pattern}`
      };
    }
  }

  // Media without text
  if (content === '[Media/No Content]' || content === '[Media]') {
    return {
      category: 'casual',
      priority: 'none',
      decision: 'review',
      reasoning: 'Media message without text'
    };
  }

  // Default
  return {
    category: 'personal',
    priority: 'low',
    decision: 'review',
    reasoning: 'No specific keywords matched'
  };
}

// Initialize ML classifier (call at startup)
export { initMLClassifier } from '../classifier/ml';

export default { initGemini, classifyWithAI, classifyWithRules };
