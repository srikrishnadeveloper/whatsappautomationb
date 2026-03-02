import {
  WORK_KEYWORDS,
  STUDY_KEYWORDS,
  IGNORE_EXACT,
  IGNORE_PATTERNS,
  SPAM_PATTERNS,
  URGENCY_KEYWORDS,
  DEADLINE_KEYWORDS,
  ACTION_VERBS,
  QUESTION_PATTERNS,
  PERSONAL_TASK_KEYWORDS,
  ClassificationResult
} from './keywords';

// ============================================
// LAYER 1: Instant reject (zero-cost filters)
// ============================================

/** Normalize text: trim, lowercase, collapse whitespace, strip trailing punctuation repeats */
function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/([!?.])\1+$/, '$1');
}

/** Messages ≤ 3 chars are never tasks */
function isTooShort(text: string): boolean {
  return text.replace(/[\s\p{Emoji}]/gu, '').length <= 3;
}

/** Exact-match lookup against IGNORE_EXACT (O(1) Set lookup) */
const ignoreExactSet = new Set(IGNORE_EXACT.map(s => s.toLowerCase()));
function isExactIgnore(normalized: string): boolean {
  return ignoreExactSet.has(normalized);
}

// ============================================
// LAYER 2: Pattern-based reject (regex)
// ============================================

function matchesIgnorePattern(raw: string): boolean {
  return IGNORE_PATTERNS.some(p => p.test(raw));
}

function matchesSpamPattern(raw: string): boolean {
  return SPAM_PATTERNS.some(p => p.test(raw));
}

// ============================================
// LAYER 3: Structural analysis
// ============================================

interface StructuralFeatures {
  wordCount: number;
  hasUrl: boolean;
  hasMention: boolean;      // @someone
  hasPhoneNumber: boolean;
  hasDate: boolean;
  hasTime: boolean;
  hasAmount: boolean;        // $100, ₹500, etc.
  sentenceCount: number;
  isAllCaps: boolean;
  hasListStructure: boolean; // numbered or bulleted list
  emojiRatio: number;        // ratio of emojis to total chars
}

function extractStructure(raw: string): StructuralFeatures {
  const words = raw.split(/\s+/).filter(w => w.length > 0);
  const emojiCount = (raw.match(/\p{Emoji}/gu) || []).length;
  const alphaCount = (raw.match(/[a-zA-Z]/g) || []).length;
  
  return {
    wordCount: words.length,
    hasUrl: /https?:\/\/\S+|www\.\S+/i.test(raw),
    hasMention: /@\w+/.test(raw),
    hasPhoneNumber: /\b\d{10,13}\b|\+\d{1,3}\s?\d{4,}/.test(raw),
    hasDate: /\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i.test(raw),
    hasTime: /\b\d{1,2}:\d{2}\s*(am|pm)?\b|\b\d{1,2}\s*(am|pm)\b/i.test(raw),
    hasAmount: /[$₹€£¥]\s*\d+|\d+\s*(rs|rupees?|dollars?|usd|inr)/i.test(raw),
    sentenceCount: (raw.match(/[.!?]+/g) || []).length + 1,
    isAllCaps: alphaCount > 5 && raw === raw.toUpperCase(),
    hasListStructure: /^\s*[\d\-\*•]\s+/m.test(raw) || /\n\s*[\d\-\*•]\s+/.test(raw),
    emojiRatio: alphaCount > 0 ? emojiCount / (emojiCount + alphaCount) : (emojiCount > 0 ? 1 : 0),
  };
}

// ============================================
// LAYER 4: Keyword scoring (weighted)
// ============================================

interface KeywordScore {
  workScore: number;
  studyScore: number;
  personalScore: number;
  urgencyScore: number;
  deadlineScore: number;
  actionScore: number;
  workMatches: string[];
  studyMatches: string[];
  personalMatches: string[];
  urgencyMatches: string[];
  deadlineMatches: string[];
  actionMatches: string[];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreKeywords(normalized: string): KeywordScore {
  const score: KeywordScore = {
    workScore: 0, studyScore: 0, personalScore: 0,
    urgencyScore: 0, deadlineScore: 0, actionScore: 0,
    workMatches: [], studyMatches: [], personalMatches: [],
    urgencyMatches: [], deadlineMatches: [], actionMatches: [],
  };
  
  // Use word-boundary matching for better accuracy
  for (const kw of WORK_KEYWORDS) {
    // For multi-word keywords, just check includes; for single words, use boundary
    const matched = kw.includes(' ')
      ? normalized.includes(kw)
      : new RegExp(`\\b${escapeRegex(kw)}\\b`).test(normalized);
    if (matched) {
      score.workScore += kw.length > 5 ? 2 : 1; // Longer keywords = more weight
      score.workMatches.push(kw);
    }
  }
  
  for (const kw of STUDY_KEYWORDS) {
    const matched = kw.includes(' ')
      ? normalized.includes(kw)
      : new RegExp(`\\b${escapeRegex(kw)}\\b`).test(normalized);
    if (matched) {
      score.studyScore += kw.length > 5 ? 2 : 1;
      score.studyMatches.push(kw);
    }
  }

  for (const kw of PERSONAL_TASK_KEYWORDS) {
    const matched = kw.includes(' ')
      ? normalized.includes(kw)
      : new RegExp(`\\b${escapeRegex(kw)}\\b`).test(normalized);
    if (matched) {
      score.personalScore += kw.length > 5 ? 2 : 1;
      score.personalMatches.push(kw);
    }
  }
  
  for (const kw of URGENCY_KEYWORDS) {
    if (normalized.includes(kw)) {
      score.urgencyScore += 2;
      score.urgencyMatches.push(kw);
    }
  }
  
  for (const kw of DEADLINE_KEYWORDS) {
    if (normalized.includes(kw)) {
      score.deadlineScore += 1;
      score.deadlineMatches.push(kw);
    }
  }
  
  for (const kw of ACTION_VERBS) {
    const matched = kw.includes(' ')
      ? normalized.includes(kw)
      : new RegExp(`\\b${escapeRegex(kw)}\\b`).test(normalized);
    if (matched) {
      score.actionScore += 1;
      score.actionMatches.push(kw);
    }
  }
  
  return score;
}

// ============================================
// LAYER 5: Question detection
// ============================================

function isQuestion(raw: string): boolean {
  return QUESTION_PATTERNS.some(p => p.test(raw));
}

// ============================================
// MAIN CLASSIFIER — layered pipeline
// ============================================

/**
 * Production-grade rule-based message classifier.
 * Runs through 5 filter layers to classify with high confidence
 * before falling through to AI.
 */
export function classifyMessage(content: string): ClassificationResult {
  const raw = content.trim();
  const normalized = normalize(raw);
  
  // ---------- Layer 1: Instant reject ----------
  if (isTooShort(normalized)) {
    return { category: 'ignore', confidence: 0.98, keywords_matched: [], has_deadline: false, has_action_verb: false, priority: 'low' };
  }
  
  if (isExactIgnore(normalized)) {
    return { category: 'ignore', confidence: 0.95, keywords_matched: [normalized], has_deadline: false, has_action_verb: false, priority: 'low' };
  }
  
  // ---------- Layer 2: Pattern reject ----------
  if (matchesIgnorePattern(raw)) {
    return { category: 'ignore', confidence: 0.92, keywords_matched: ['pattern:greeting/pleasantry'], has_deadline: false, has_action_verb: false, priority: 'low' };
  }
  
  if (matchesSpamPattern(raw)) {
    return { category: 'ignore', confidence: 0.95, keywords_matched: ['pattern:spam/marketing'], has_deadline: false, has_action_verb: false, priority: 'low' };
  }
  
  // ---------- Layer 3: Structural analysis ----------
  const structure = extractStructure(raw);
  
  // Emoji-heavy messages (>50% emoji) are almost never tasks
  if (structure.emojiRatio > 0.5 && structure.wordCount < 5) {
    return { category: 'ignore', confidence: 0.90, keywords_matched: ['structure:emoji-heavy'], has_deadline: false, has_action_verb: false, priority: 'low' };
  }
  
  // Very short messages with no keywords (< 5 words, no action verb, no deadline)
  // will be checked after keyword scoring below
  
  // ---------- Layer 4: Keyword scoring ----------
  const scores = scoreKeywords(normalized);
  
  const totalTaskScore = scores.workScore + scores.studyScore + scores.personalScore;
  const hasDeadline = scores.deadlineScore > 0 || structure.hasDate || structure.hasTime;
  const hasAction = scores.actionScore > 0;
  const isUrgent = scores.urgencyScore > 0;
  
  // Short messages (< 8 words) with zero task signals → ignore with high confidence
  if (structure.wordCount < 8 && totalTaskScore === 0 && !hasDeadline && !hasAction && !isUrgent) {
    // But if it's a question, send to review (low confidence = AI will handle)
    if (isQuestion(raw)) {
      return { category: 'personal', confidence: 0.35, keywords_matched: ['question'], has_deadline: false, has_action_verb: false, priority: 'low' };
    }
    return { category: 'ignore', confidence: 0.85, keywords_matched: [], has_deadline: false, has_action_verb: false, priority: 'low' };
  }
  
  // ---------- Layer 5: Category determination ----------
  let category: 'work' | 'study' | 'personal' | 'ignore';
  let confidence: number;
  let allMatches: string[] = [];
  
  // Determine winner
  const maxScore = Math.max(scores.workScore, scores.studyScore, scores.personalScore);
  
  if (maxScore === 0) {
    // No category keywords but may have action/deadline signals
    if (hasAction && hasDeadline) {
      category = 'personal'; // Has task structure but no domain signal
      confidence = 0.55;
      allMatches = [...scores.actionMatches, ...scores.deadlineMatches];
    } else if (hasAction || hasDeadline) {
      category = 'personal';
      confidence = 0.40;
      allMatches = [...scores.actionMatches, ...scores.deadlineMatches];
    } else if (isQuestion(raw)) {
      category = 'personal';
      confidence = 0.30; // Low confidence → AI will decide
      allMatches = ['question'];
    } else {
      category = 'ignore';
      confidence = 0.70;
      allMatches = [];
    }
  } else if (scores.workScore > scores.studyScore && scores.workScore >= scores.personalScore) {
    category = 'work';
    confidence = Math.min(0.50 + (scores.workScore * 0.08), 0.95);
    allMatches = scores.workMatches;
  } else if (scores.studyScore > scores.workScore && scores.studyScore >= scores.personalScore) {
    category = 'study';
    confidence = Math.min(0.50 + (scores.studyScore * 0.08), 0.95);
    allMatches = scores.studyMatches;
  } else if (scores.personalScore > 0) {
    category = 'personal';
    confidence = Math.min(0.50 + (scores.personalScore * 0.08), 0.90);
    allMatches = scores.personalMatches;
  } else {
    // Tie between work and study
    category = scores.workScore >= scores.studyScore ? 'work' : 'study';
    confidence = 0.55;
    allMatches = [...scores.workMatches, ...scores.studyMatches];
  }
  
  // Boost confidence if multiple signals align
  if (hasAction && hasDeadline && category !== 'ignore') {
    confidence = Math.min(confidence + 0.15, 0.95);
  } else if (hasAction || hasDeadline) {
    confidence = Math.min(confidence + 0.08, 0.92);
  }
  
  // If it has list structure, boost (lists often contain tasks)
  if (structure.hasListStructure && category !== 'ignore') {
    confidence = Math.min(confidence + 0.10, 0.95);
  }
  
  // ---------- Priority determination ----------
  let priority: 'urgent' | 'high' | 'medium' | 'low';
  
  if (isUrgent || structure.isAllCaps) {
    priority = 'urgent';
  } else if (hasDeadline && hasAction) {
    priority = 'high';
  } else if (hasDeadline || hasAction) {
    priority = 'medium';
  } else {
    priority = 'low';
  }
  
  return {
    category,
    confidence,
    keywords_matched: allMatches,
    has_deadline: hasDeadline,
    has_action_verb: hasAction,
    priority,
  };
}

/**
 * Make a decision: should this message become a task?
 * Uses the classification result + message structural features
 */
export function makeDecision(
  classification: ClassificationResult,
  messageLength: number
): 'create' | 'ignore' | 'review' {
  
  // IGNORE with high confidence → ignore (don't waste AI)
  if (classification.category === 'ignore' && classification.confidence >= 0.80) {
    return 'ignore';
  }
  
  // Very short messages are never tasks (unless urgent)
  if (messageLength < 8 && classification.priority !== 'urgent') {
    return 'ignore';
  }
  
  // URGENT with any task category → always create
  if (classification.priority === 'urgent' && classification.category !== 'ignore') {
    return 'create';
  }
  
  // Work/study with action verb AND deadline → create
  if (
    (classification.category === 'work' || classification.category === 'study') &&
    classification.has_action_verb && classification.has_deadline &&
    classification.confidence > 0.50
  ) {
    return 'create';
  }
  
  // Work/study with either action verb or deadline + good confidence → create
  if (
    (classification.category === 'work' || classification.category === 'study') &&
    (classification.has_action_verb || classification.has_deadline) &&
    classification.confidence >= 0.65
  ) {
    return 'create';
  }
  
  // Personal task with strong signals → create
  if (
    classification.category === 'personal' &&
    classification.has_action_verb &&
    classification.confidence >= 0.55
  ) {
    return 'create';
  }
  
  // Low confidence on anything → let AI decide (review)
  if (classification.confidence < 0.50) {
    return 'review';
  }
  
  // Ignore category with moderate confidence  
  if (classification.category === 'ignore') {
    return 'ignore';
  }
  
  // Personal without clear task signals → ignore
  if (classification.category === 'personal' && !classification.has_action_verb && !classification.has_deadline) {
    return 'ignore';
  }
  
  // Everything else → review (send to AI)
  return 'review';
}
