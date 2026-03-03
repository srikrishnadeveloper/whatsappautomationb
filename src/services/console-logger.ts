/**
 * Console Logger — Rich Terminal Output
 * Beautiful, colour-coded console logs for every major pipeline event.
 */

// ANSI colour helpers
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',

  black:   '\x1b[30m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',

  bgRed:    '\x1b[41m',
  bgGreen:  '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue:   '\x1b[44m',
  bgMagenta:'\x1b[45m',
  bgCyan:   '\x1b[46m',
};

function ts(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function pad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

// ───────────────────────── log SSE broadcaster ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const logSseClients: Set<any> = new Set();

export function subscribeToLogs(res: any) {
  logSseClients.add(res);
}
export function unsubscribeFromLogs(res: any) {
  logSseClients.delete(res);
}

// Tee every process.stdout write → connected SSE clients (ANSI stripped)
const _origWrite = process.stdout.write.bind(process.stdout);
// @ts-ignore
process.stdout.write = function (chunk: any, enc?: any, cb?: any) {
  const result = _origWrite(chunk, enc, cb);
  if (logSseClients.size > 0 && chunk) {
    const clean = String(chunk)
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // strip ANSI colour codes
      .replace(/\r/g, '');
    if (clean.trim()) {
      const payload = `data: ${JSON.stringify({ line: clean })}\n\n`;
      logSseClients.forEach(client => {
        try { client.write(payload); } catch { logSseClients.delete(client); }
      });
    }
  }
  return result;
};

// ───────────────────────── helpers ─────────────────────────

function categoryColor(cat: string): string {
  switch (cat) {
    case 'work':     return c.blue;
    case 'study':    return c.cyan;
    case 'personal': return c.magenta;
    case 'urgent':   return c.red + c.bold;
    case 'casual':
    case 'ignore':   return c.dim;
    case 'spam':     return c.red + c.dim;
    default:         return c.white;
  }
}

function priorityColor(p: string): string {
  switch (p) {
    case 'urgent': case 'high':   return c.red;
    case 'medium':                return c.yellow;
    case 'low':                   return c.green;
    default:                      return c.dim;
  }
}

function decisionBadge(d: string): string {
  switch (d) {
    case 'create': return `${c.bgGreen}${c.black} CREATE ${c.reset}`;
    case 'review': return `${c.bgYellow}${c.black} REVIEW ${c.reset}`;
    case 'ignore': return `${c.bgBlue}${c.black} IGNORE ${c.reset}`;
    default:       return `${c.dim} ${d.toUpperCase()} ${c.reset}`;
  }
}

// ───────────────────────── public API ─────────────────────────

/** 1 — New message arrived from WhatsApp */
export function logMessageReceived(sender: string, chatName: string, content: string, msgKey: string, isGroup: boolean) {
  const preview = content.replace(/\n/g, ' ').slice(0, 80);
  const chat = chatName.endsWith('@g.us') ? `${isGroup ? '👥' : '💬'} group` : `💬 ${chatName}`;
  console.log('');
  console.log(`${c.cyan}${'─'.repeat(70)}${c.reset}`);
  console.log(`${c.cyan}${c.bold} 📩 NEW MESSAGE${c.reset}  ${c.dim}${ts()}${c.reset}  ${c.dim}key:${msgKey.slice(0, 8)}...${c.reset}`);
  console.log(`${c.cyan}${'─'.repeat(70)}${c.reset}`);
  console.log(`  ${c.bold}FROM   ${c.reset}│ ${c.white}${sender}${c.reset}`);
  console.log(`  ${c.bold}CHAT   ${c.reset}│ ${c.dim}${chat}${c.reset}`);
  console.log(`  ${c.bold}MSG    ${c.reset}│ "${c.white}${preview}${content.length > 80 ? '…' : ''}${c.reset}"`);
}

/** 2a — Message skipped (duplicate) */
export function logSkipDuplicate(msgKey: string, reason: 'cache' | 'db') {
  console.log(`  ${c.dim}⏭  SKIP  │ Duplicate (${reason}) — key ${msgKey.slice(0, 12)}...${c.reset}`);
}

/** 2b — Message skipped (status broadcast) */
export function logSkipStatus() {
  console.log(`  ${c.dim}⏭  SKIP  │ Status broadcast — ignored${c.reset}`);
}

/** 2c — Own message stored without classification */
export function logOwnMessage(content: string) {
  const preview = content.replace(/\n/g, ' ').slice(0, 60);
  console.log(`  ${c.dim}👤 OWN   │ Stored without classification: "${preview}"${c.reset}`);
}

/** 3 — Privacy blocked */
export function logPrivacyBlocked(sender: string) {
  console.log(`  ${c.yellow}🔒 PRIVATE │ ${sender} is on your ignore list — skipping AI${c.reset}`);
}

/** 4a — Sent to rule-based classifier */
export function logClassifyStart(contentLength: number) {
  console.log(`  ${c.blue}🔍 CLASSIFY${c.reset} │ ${contentLength} chars — trying rule-based...`);
}

/** 4b — Rule-based result (high confidence, skips ML/AI) */
export function logRuleBasedResult(category: string, priority: string, decision: string, confidence: number, keywords: string[]) {
  const kwStr = keywords.slice(0, 5).join(', ') || 'pattern';
  console.log(`  ${c.green}📏 RULES ${c.reset} │ ${categoryColor(category)}${pad(category, 9)}${c.reset} ${priorityColor(priority)}${pad(priority, 7)}${c.reset} ${decisionBadge(decision)}  conf=${c.bold}${confidence.toFixed(2)}${c.reset}  kw:[${c.dim}${kwStr}${c.reset}]`);
}

/** 4c — ML model result */
export function logMLResult(category: string, priority: string, decision: string, confidence: number, inferenceMs: number, callNum: number) {
  console.log(`  ${c.magenta}🤖 ML    ${c.reset} │ ${categoryColor(category)}${pad(category, 9)}${c.reset} ${priorityColor(priority)}${pad(priority, 7)}${c.reset} ${decisionBadge(decision)}  conf=${c.bold}${confidence.toFixed(2)}${c.reset}  ${c.dim}${inferenceMs}ms  #${callNum}${c.reset}`);
}

/** 4d — Escalating to Gemini (low confidence from rules/ML) */
export function logEscalatingToGemini(reason: string) {
  console.log(`  ${c.yellow}⚡ GEMINI ${c.reset} │ ${c.yellow}Low confidence (${reason}) — calling Gemini AI...${c.reset}`);
}

/** 4e — Gemini AI result */
export function logGeminiResult(category: string, priority: string, decision: string, actionCount: number, callNum: number) {
  const actStr = actionCount > 0 ? `${c.green}${actionCount} action${actionCount > 1 ? 's' : ''} extracted${c.reset}` : `${c.dim}no actions${c.reset}`;
  console.log(`  ${c.cyan}✨ GEMINI  ${c.reset} │ ${categoryColor(category)}${pad(category, 9)}${c.reset} ${priorityColor(priority)}${pad(priority, 7)}${c.reset} ${decisionBadge(decision)}  ${actStr}  ${c.dim}#${callNum}${c.reset}`);
}

/** 4f — AI/ML unavailable, using fallback */
export function logFallback(reason: string) {
  console.log(`  ${c.yellow}⚠  FALLBACK│ ${reason}${c.reset}`);
}

/** 5 — Stored to DB */
export function logStored(msgId: string, storageType: string, category: string, priority: string) {
  console.log(`  ${c.green}💾 STORED  │ ${c.bold}${msgId.slice(0, 16)}...${c.reset}  ${c.dim}[${storageType}]${c.reset}  ${categoryColor(category)}${category}${c.reset} / ${priorityColor(priority)}${priority}${c.reset}`);
}

/** 6a — Action item created from AI extraction */
export function logActionItemCreated(title: string, priority: string, source: 'ai' | 'rule') {
  const badge = source === 'ai' ? `${c.cyan}[AI]${c.reset}` : `${c.blue}[rule]${c.reset}`;
  console.log(`  ${c.green}✅ ACTION  │ ${badge} ${priorityColor(priority)}[${priority}]${c.reset}  "${c.white}${title.slice(0, 70)}${c.reset}"`);
}

/** 6b — No action items (message ignored by classifier) */
export function logIgnored(reason: string) {
  console.log(`  ${c.dim}🚫 IGNORED │ ${reason}${c.reset}`);
}

/** Separator line at end of message processing */
export function logMessageEnd() {
  console.log(`${c.dim}${'─'.repeat(70)}${c.reset}`);
}

/** Generic error in pipeline */
export function logPipelineError(stage: string, err: string) {
  console.log(`  ${c.red}${c.bold}💥 ERROR   │ [${stage}] ${err}${c.reset}`);
}

/** Startup banner */
export function logStartupBanner(port: number | string) {
  console.log('');
  console.log(`${c.green}${'═'.repeat(70)}${c.reset}`);
  console.log(`${c.green}${c.bold}   🚀  WhatsApp Task Manager — Backend${c.reset}  ${c.dim}port ${port}${c.reset}`);
  console.log(`${c.green}${'═'.repeat(70)}${c.reset}`);
  console.log('');
}

/** WhatsApp connected */
export function logWhatsAppConnected(phone: string, name: string) {
  console.log('');
  console.log(`${c.green}╔${'═'.repeat(50)}╗${c.reset}`);
  console.log(`${c.green}║  ✅ WhatsApp Connected${c.reset}                           ${c.green}║${c.reset}`);
  console.log(`${c.green}║  ${c.bold}${c.white}${pad(`📱 ${name} (${phone})`, 48)}${c.reset}${c.green}║${c.reset}`);
  console.log(`${c.green}╚${'═'.repeat(50)}╝${c.reset}`);
  console.log('');
}

/** WhatsApp disconnected */
export function logWhatsAppDisconnected(reason: string) {
  console.log(`${c.yellow}⚠  WhatsApp Disconnected${c.reset} — ${c.dim}${reason}${c.reset}`);
}

/** Classifier stats summary */
export function logClassifierStats(rule: number, ml: number, ai: number) {
  const total = rule + ml + ai;
  if (total === 0) return;
  const rPct = ((rule / total) * 100).toFixed(0);
  const mPct = ((ml / total) * 100).toFixed(0);
  const aPct = ((ai / total) * 100).toFixed(0);
  console.log(`${c.dim}  📊 Classifier stats: rules=${rPct}% (${rule})  ml=${mPct}% (${ml})  gemini=${aPct}% (${ai})  total=${total}${c.reset}`);
}

export default {
  logMessageReceived,
  logSkipDuplicate,
  logSkipStatus,
  logOwnMessage,
  logPrivacyBlocked,
  logClassifyStart,
  logRuleBasedResult,
  logMLResult,
  logEscalatingToGemini,
  logGeminiResult,
  logFallback,
  logStored,
  logActionItemCreated,
  logIgnored,
  logMessageEnd,
  logPipelineError,
  logStartupBanner,
  logWhatsAppConnected,
  logWhatsAppDisconnected,
  logClassifierStats,
};
