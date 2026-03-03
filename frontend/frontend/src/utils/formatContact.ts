/**
 * Formats a WhatsApp contact for display.
 *
 * Priority:
 *  1. pushName / sender — if it's a real name (no '@' in it)
 *  2. chatName / JID    — strip @s.whatsapp.net / @g.us, format digits as +phone
 *  3. Fallback          — 'Unknown'
 */
export function formatContact(
  sender?: string | null,
  chatName?: string | null,
): string {
  // If sender looks like a real name (more than 1 char, no '@'), use it
  if (sender && sender !== 'Unknown' && !sender.includes('@') && sender.trim().length > 1) {
    return sender.trim()
  }

  // Otherwise try to clean the JID
  const jid = (chatName || sender || '').trim()
  if (!jid) return 'Unknown'

  // Strip WhatsApp domain suffixes
  const cleaned = jid.replace(/@s\.whatsapp\.net|@g\.us/gi, '').trim()
  if (!cleaned) return 'Unknown'

  // If it's all digits it's a phone number — add '+'
  if (/^\d+$/.test(cleaned)) return `+${cleaned}`

  return cleaned
}

/** Returns a single initial letter for avatars, always uppercase. */
export function contactInitial(
  sender?: string | null,
  chatName?: string | null,
): string {
  const name = formatContact(sender, chatName)
  return (name[0] ?? '?').toUpperCase()
}
