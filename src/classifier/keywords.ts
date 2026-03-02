// Keyword lists for message classification - Production Grade

// ===== IGNORE PATTERNS (catch casual/spam/greetings/media-only) =====

// Short messages that are NEVER tasks (exact match or startsWith)
export const IGNORE_EXACT: string[] = [
  'ok', 'okay', 'k', 'kk', 'hmm', 'hm', 'ya', 'yep', 'yup', 'nope', 'nah',
  'lol', 'lmao', 'rofl', 'haha', 'hehe', 'hihi', 'xd', '😂', '👍', '👎', '❤️', '🙏',
  'hi', 'hey', 'hello', 'yo', 'sup', 'hii', 'hiii', 'helloo',
  'bye', 'byee', 'cya', 'ttyl', 'gn', 'gm', 'good night', 'good morning',
  'thanks', 'thank you', 'thanku', 'thnx', 'thx', 'ty', 'tysm',
  'sorry', 'sorryy', 'my bad', 'oops', 'np', 'no problem', 'no worries',
  'yes', 'no', 'yea', 'yeah', 'naa', 'nahi', 'ha', 'haan',
  'cool', 'nice', 'great', 'awesome', 'perfect', 'amazing', 'wow', 'omg',
  'done', 'noted', 'seen', 'read', 'roger', 'copy', 'ack', 'got it', 'understood',
  'good', 'fine', 'alright', 'right', 'true', 'exactly', 'correct', 'sure',
  'same', 'ikr', 'fr', 'bruh', 'bro', 'dude', 'broo', 'bhai', 'yaar',
  'what', 'why', 'how', 'when', 'where', 'who', 'huh', 'wut',
  'idk', 'idc', 'smh', 'tbh', 'imo', 'fyi', 'btw', 'nvm', 'wdym',
  '?', '!', '...', '..', '.', '😊', '😅', '🤣', '😭', '🫡', '💀',
  'congrats', 'congratulations', 'happy birthday', 'hbd', 'many happy returns',
  'good luck', 'best wishes', 'take care', 'stay safe', 'get well soon',
  'welcome', "you're welcome", 'yw', 'no mention',
  'miss you', 'love you', 'ily', 'xoxo', 'muah', '💕', '💗',
];

// Greeting/pleasantry PATTERNS (regex)
export const IGNORE_PATTERNS: RegExp[] = [
  /^(good\s+)?(morning|afternoon|evening|night|day)\s*[!.]*$/i,
  /^(hi|hey|hello|yo|sup|hola|namaste|salaam)\s*[!.,\s]*$/i,
  /^(bye|goodbye|see\s*y(ou|a)|later|ta+ta+|ciao)\s*[!.]*$/i,
  /^(thanks?|thank\s*you|thanku|thx|ty)\s*(so\s*much|a\s*lot|buddy|bro|man|mate)?\s*[!.]*$/i,
  /^(ok|okay|k+|hmm+|hm+|ah+|oh+|oo+h?|mhm+)\s*[!.]*$/i,
  /^(lol|lmao|rofl|haha+|hehe+|xd+|😂+|🤣+|💀+)\s*[!.]*$/i,
  /^(nice|cool|great|awesome|perfect|amazing|wonderful|brilliant|fantastic)\s*[!.]*$/i,
  /^(yes|no|yep|yup|nope|nah|ya|yea|yeah|naa)\s*[!.,]*$/i,
  /^[\p{Emoji}\s]{1,10}$/u,  // emoji-only messages
  /^(happy|merry)\s+(birthday|anniversary|new\s*year|christmas|diwali|eid|holi)/i,
  /^(rip|omg|wtf|smh|bruh|oof|yikes|sheesh)\s*[!.]*$/i,
  /^https?:\/\/\S+$/i,  // URL-only messages (links without context)
  /^(forwarded|fwd|fw)\s*(from|:|\|)/i,  // forwarded headers
  /^\*forwarded\*/i,  // WhatsApp forwarded label
  /^this message was deleted$/i,
  /^you deleted this message$/i,
  /^waiting for this message/i,
  /^<media omitted>$/i,
  /^\[media\]$/i,
  /^sticker$/i,
  /^gif$/i,
  /^(voice|audio)\s*message$/i,
  /^missed\s+(voice|video)\s+call$/i,
  /^live location shared$/i,
  /^location:\s/i,
  /^contact card/i,
];

// Spam/marketing patterns
export const SPAM_PATTERNS: RegExp[] = [
  /\b(offer|discount|sale|deal|coupon|cashback|%\s*off)\b.*\b(buy|shop|order|click|link|code)\b/i,
  /\b(limited\s*time|hurry|expires?|last\s*chance|act\s*now|don'?t\s*miss)\b/i,
  /\b(free|prize|winner|won|lottery|lucky|congratulations!)\b.*\b(click|claim|call|dial)\b/i,
  /\b(subscribe|unsubscribe|opt.?out|reply\s*stop)\b/i,
  /\b(crypto|bitcoin|btc|eth|nft|forex|trading\s*signal)\b.*\b(profit|earn|invest|guaranteed)\b/i,
  /\bwa\.me\/\S+/i,  // WhatsApp invite links as spam
  /\b(join|forward|share)\s*(this|to|with)\s*\d+\s*(people|friends|groups)/i,
  /\*\*.*\*\*.*\*\*.*\*\*/,  // Over-formatted marketing messages
];

// ===== WORK KEYWORDS (expanded significantly) =====
export const WORK_KEYWORDS: string[] = [
  // Meetings & Events
  'meeting', 'standup', 'stand-up', 'scrum', 'sprint', 'retro', 'retrospective',
  'sync', 'sync-up', 'huddle', 'townhall', 'all-hands', 'one-on-one', '1:1', '1on1',
  'conference', 'webinar', 'workshop', 'seminar', 'training', 'onboarding',
  'interview', 'demo', 'presentation', 'pitch', 'review meeting',
  // Project Management
  'project', 'milestone', 'deliverable', 'requirement', 'specification', 'spec',
  'ticket', 'jira', 'trello', 'asana', 'notion', 'confluence', 'slack',
  'backlog', 'epic', 'story', 'user story', 'acceptance criteria',
  'kanban', 'agile', 'waterfall', 'roadmap', 'timeline', 'gantt',
  'blocker', 'impediment', 'dependency', 'risk', 'escalation',
  // Documents & Communication
  'report', 'proposal', 'invoice', 'contract', 'agreement', 'nda', 'sow', 'sla',
  'memo', 'minutes', 'mou', 'rfp', 'rfq', 'quotation', 'estimate',
  'budget', 'forecast', 'p&l', 'balance sheet', 'revenue',
  // People & Roles
  'client', 'customer', 'vendor', 'stakeholder', 'ceo', 'cto', 'cfo', 'cmo',
  'manager', 'director', 'vp', 'lead', 'senior', 'junior', 'intern',
  'team lead', 'tech lead', 'product owner', 'scrum master',
  'hr', 'recruitment', 'payroll', 'appraisal', 'performance review',
  // Technical
  'deployment', 'deploy', 'release', 'production', 'staging', 'qa', 'testing',
  'code review', 'pull request', 'pr', 'merge', 'branch', 'commit',
  'bug', 'hotfix', 'patch', 'incident', 'outage', 'downtime', 'sev1', 'sev2',
  'api', 'database', 'server', 'cloud', 'aws', 'gcp', 'azure',
  // General Work
  'deadline', 'due date', 'eod', 'eow', 'cob', 'asap', 'urgent', 'priority',
  'action item', 'follow-up', 'followup', 'follow up', 'pending',
  'approval', 'sign-off', 'signoff', 'feedback', 'review',
  'schedule', 'calendar', 'availability', 'slot', 'reschedule',
  'kpi', 'okr', 'target', 'goal', 'objective', 'metric',
  'onsite', 'offsite', 'remote', 'wfh', 'hybrid', 'office',
  'salary', 'bonus', 'increment', 'promotion', 'transfer',
];

// ===== STUDY KEYWORDS (expanded) =====
export const STUDY_KEYWORDS: string[] = [
  // Academics
  'assignment', 'homework', 'project submission', 'lab report', 'thesis', 'dissertation',
  'exam', 'examination', 'midterm', 'final', 'quiz', 'test', 'viva', 'oral exam',
  'gpa', 'cgpa', 'grades', 'marks', 'result', 'scorecard', 'transcript',
  // Course
  'lecture', 'tutorial', 'seminar', 'workshop', 'lab', 'practical',
  'course', 'module', 'credit', 'elective', 'prerequisite',
  'syllabus', 'curriculum', 'textbook', 'reference book', 'study material',
  // People
  'professor', 'prof', 'teacher', 'instructor', 'ta', 'teaching assistant',
  'dean', 'hod', 'principal', 'faculty', 'classmate', 'batch',
  // Places & Events
  'classroom', 'library', 'campus', 'hostel', 'canteen', 'auditorium',
  'college', 'university', 'school', 'institute', 'department',
  'semester', 'term', 'academic year', 'session', 'batch',
  'placement', 'internship', 'campus recruitment', 'career fair',
  // Activities
  'research', 'paper', 'journal', 'publication', 'citation',
  'study group', 'group project', 'team project', 'presentation',
  'chapter', 'notes', 'revision', 'practice', 'mock test',
  'scholarship', 'fellowship', 'grant', 'stipend',
  'registration', 'enrollment', 'admission', 'application',
];

// ===== URGENCY KEYWORDS =====
export const URGENCY_KEYWORDS: string[] = [
  'urgent', 'asap', 'immediately', 'emergency', 'critical', 'blocker',
  'right now', 'right away', 'this instant', 'at once',
  'today itself', 'by today', 'by tonight', 'within the hour',
  'time-sensitive', 'time sensitive', 'top priority', 'p0', 'p1',
  'sev1', 'severity 1', 'production down', 'outage',
  'last minute', 'last-minute', 'running late', 'overdue',
  "can't wait", 'cannot wait', 'no time', 'hurry up',
  'drop everything', 'need it now', 'needed now', 'asap please',
];

// ===== DEADLINE KEYWORDS =====
export const DEADLINE_KEYWORDS: string[] = [
  'deadline', 'due', 'due date', 'due by', 'submit by', 'send by',
  'deliver by', 'before', 'until', 'no later than', 'latest by',
  'expires', 'expiry', 'expiration', 'cutoff', 'cut-off',
  'tomorrow', 'tonight', 'today', 'this week', 'next week',
  'this month', 'next month', 'end of day', 'end of week',
  'eod', 'eow', 'eom', 'cob', 'by friday', 'by monday',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

// ===== ACTION VERBS (things that indicate tasks) =====
export const ACTION_VERBS: string[] = [
  // Communication
  'submit', 'send', 'forward', 'reply', 'respond', 'email', 'message', 'call',
  'notify', 'inform', 'update', 'report', 'escalate', 'follow up',
  // Creation
  'create', 'make', 'build', 'write', 'draft', 'compose', 'design', 'develop',
  'prepare', 'set up', 'setup', 'configure', 'implement', 'code',
  // Review
  'review', 'check', 'verify', 'validate', 'approve', 'confirm', 'sign off',
  'proofread', 'audit', 'inspect', 'test', 'evaluate', 'assess',
  // Organization
  'schedule', 'book', 'arrange', 'organize', 'plan', 'coordinate',
  'reschedule', 'cancel', 'postpone', 'prioritize',
  // Completion
  'complete', 'finish', 'finalize', 'close', 'resolve', 'fix', 'patch',
  'deliver', 'ship', 'deploy', 'release', 'launch', 'publish',
  // Learning
  'study', 'learn', 'practice', 'revise', 'memorize', 'research',
  'read', 'analyze', 'summarize', 'present',
  // Physical
  'buy', 'purchase', 'order', 'pick up', 'drop off', 'collect',
  'bring', 'carry', 'move', 'transfer', 'deliver', 'return',
  'pay', 'deposit', 'withdraw', 'transfer money',
  'visit', 'go to', 'attend', 'meet', 'join',
  'clean', 'wash', 'cook', 'repair', 'fix',
];

// ===== QUESTION INDICATORS (questions need review, not auto-ignore) =====
export const QUESTION_PATTERNS: RegExp[] = [
  /^(can|could|would|will|shall|should|do|does|did|is|are|was|were|have|has|had)\s+/i,
  /\?\s*$/,  // Ends with question mark
  /^(what|when|where|which|who|whom|whose|how|why)\s+/i,
  /^(please|pls|plz|kindly)\s+(tell|share|send|let|confirm|check)/i,
];

// ===== PERSONAL TASK INDICATORS =====
export const PERSONAL_TASK_KEYWORDS: string[] = [
  'grocery', 'groceries', 'shopping list', 'buy milk', 'buy eggs',
  'doctor', 'appointment', 'dentist', 'hospital', 'clinic', 'pharmacy',
  'rent', 'emi', 'bill', 'payment', 'recharge', 'insurance', 'premium',
  'passport', 'visa', 'aadhaar', 'pan card', 'license', 'permit',
  'flight', 'train', 'bus', 'ticket', 'booking', 'reservation', 'hotel',
  'birthday', 'anniversary', 'party', 'gift', 'invitation', 'rsvp',
  'laundry', 'dry clean', 'tailor', 'plumber', 'electrician', 'mechanic',
  'gym', 'workout', 'exercise', 'yoga', 'meditation', 'diet',
  'prescription', 'medicine', 'vaccination', 'checkup', 'blood test',
];

export interface ClassificationResult {
  category: 'work' | 'study' | 'personal' | 'ignore';
  confidence: number; // 0-1
  keywords_matched: string[];
  has_deadline: boolean;
  has_action_verb: boolean;
  priority: 'urgent' | 'high' | 'medium' | 'low';
}
