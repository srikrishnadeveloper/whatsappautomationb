/**
 * =====================================================================
 * FEATURE ENRICHER
 * Enriches raw text with detected feature tags for better ML accuracy
 * Used by both training (train.ts) and inference (ml-classifier.ts)
 * =====================================================================
 */

/**
 * Enrich text with detected feature tags that help the classifier
 * E.g., "meeting at 3pm" → "meeting at 3pm __HAS_TIME__ __HAS_ACTION__"
 */
export function enrichText(text: string): string {
  const lower = text.toLowerCase();
  const features: string[] = [lower];

  // Time/date signals
  if (/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test(text)) features.push('__HAS_TIME__');
  if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i.test(lower)) features.push('__HAS_DAY__');
  if (/\b(deadline|due|by|before|until|submit)\b/i.test(lower)) features.push('__HAS_DEADLINE__');

  // Urgency
  if (/\b(urgent|asap|immediately|emergency|critical)\b/i.test(lower)) features.push('__URGENT__');

  // Action verbs
  if (/\b(submit|send|review|check|complete|finish|prepare|create|deploy|fix|update|approve|attend|join|schedule|book)\b/i.test(lower))
    features.push('__HAS_ACTION__');

  // Domain signals
  if (/\b(meeting|standup|sprint|jira|client|deploy|production|api|server|project|milestone|stakeholder|salary|hr|invoice|budget)\b/i.test(lower))
    features.push('__WORK_SIGNAL__');
  if (/\b(assignment|homework|exam|quiz|thesis|lecture|professor|lab|semester|gpa|course|campus|library|college|university)\b/i.test(lower))
    features.push('__STUDY_SIGNAL__');
  if (/\b(buy|grocery|doctor|appointment|bill|pay|flight|hotel|gym|rent|emi|medicine|birthday|gift|laundry|plumber)\b/i.test(lower))
    features.push('__PERSONAL_SIGNAL__');

  // Length signal
  if (text.length < 15) features.push('__SHORT__');
  if (text.length > 80) features.push('__LONG__');

  // Structure
  if (/[?]/.test(text)) features.push('__QUESTION__');
  if (/[!]{2,}/.test(text)) features.push('__EXCLAIM__');
  if (/https?:\/\//.test(text)) features.push('__HAS_URL__');
  if (/^\s*[\d\-\*•]\s+/m.test(text)) features.push('__HAS_LIST__');

  // Emoji-heavy
  const emojiCount = (text.match(/\p{Emoji}/gu) || []).length;
  const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (emojiCount > 0 && alphaCount < 5) features.push('__EMOJI_ONLY__');

  // Greeting/reaction patterns
  if (/^(ok|okay|k|hmm|ya|hey|hi|hello|bye|thanks|lol|haha|nice|cool|great)\b/i.test(lower)) features.push('__GREETING__');
  if (/^(good\s+)?(morning|afternoon|evening|night)/i.test(lower)) features.push('__GREETING__');

  return features.join(' ');
}
