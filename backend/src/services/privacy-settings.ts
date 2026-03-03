/**
 * Privacy Settings Service
 *
 * Manages per-user lists of senders/groups whose messages should NOT
 * be classified or turned into tasks ("ignored senders").
 *
 * Storage: Supabase table `privacy_blocked_senders` when available,
 * falls back to a lightweight in-memory map.
 *
 * WhatsApp JID formats:
 *   Individual: 919876543210@s.whatsapp.net
 *   Group:      120363XXXXXXXX@g.us
 */

import { supabaseAdmin } from '../config/supabase';
import { createAuthenticatedClient } from '../config/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

export interface BlockedSender {
  id?: string;
  user_id: string;
  jid: string;           // Full WhatsApp JID (or partial phone number)
  display_name: string;  // Human-readable label
  type: 'contact' | 'group';
  created_at?: string;
}

// ── In-memory fallback ──────────────────────────────────────────────────────

/** userId → Map<jid, BlockedSender> */
const memStore = new Map<string, Map<string, BlockedSender>>();

function memGet(userId: string): BlockedSender[] {
  return Array.from(memStore.get(userId)?.values() ?? []);
}

function memAdd(userId: string, entry: BlockedSender): void {
  if (!memStore.has(userId)) memStore.set(userId, new Map());
  memStore.get(userId)!.set(entry.jid, entry);
}

function memRemove(userId: string, jid: string): void {
  memStore.get(userId)?.delete(jid);
}

// ── DB helpers ──────────────────────────────────────────────────────────────

function getDb(userToken?: string): SupabaseClient | null {
  try {
    return userToken
      ? createAuthenticatedClient(userToken)
      : (supabaseAdmin ?? null);
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Return all blocked senders for a user.
 */
export async function getBlockedSenders(
  userId: string,
  userToken?: string
): Promise<BlockedSender[]> {
  const db = getDb(userToken);
  if (!db) return memGet(userId);

  try {
    const { data, error } = await db
      .from('privacy_blocked_senders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as BlockedSender[];
  } catch {
    return memGet(userId);
  }
}

/**
 * Check whether a specific JID is on the block list.
 * Also matches by a normalised phone-number prefix for robustness
 * (e.g. "919876543210" matches "919876543210@s.whatsapp.net").
 */
export async function isSenderBlocked(
  userId: string,
  jid: string,
  userToken?: string
): Promise<boolean> {
  const list = await getBlockedSenders(userId, userToken);
  const bare = jid.split('@')[0]; // phone number without suffix
  return list.some(
    b => b.jid === jid || b.jid === bare || b.jid.startsWith(bare)
  );
}

/**
 * Add a sender/group to the block list.
 * @param jid   Full JID, bare phone number, or group ID.
 */
export async function blockSender(
  userId: string,
  jid: string,
  displayName: string,
  userToken?: string
): Promise<void> {
  const entry: BlockedSender = {
    user_id: userId,
    jid,
    display_name: displayName || jid,
    type: jid.endsWith('@g.us') ? 'group' : 'contact',
    created_at: new Date().toISOString(),
  };

  const db = getDb(userToken);
  if (!db) { memAdd(userId, entry); return; }

  try {
    const { error } = await db.from('privacy_blocked_senders').upsert(entry, {
      onConflict: 'user_id,jid',
    });
    if (error) throw error;
  } catch {
    memAdd(userId, entry);
  }
}

/**
 * Remove a sender from the block list.
 */
export async function unblockSender(
  userId: string,
  jid: string,
  userToken?: string
): Promise<void> {
  memRemove(userId, jid);

  const db = getDb(userToken);
  if (!db) return;

  try {
    await db
      .from('privacy_blocked_senders')
      .delete()
      .eq('user_id', userId)
      .eq('jid', jid);
  } catch {
    // Already removed from memory above
  }
}

/**
 * Normalise a user-entered phone number / JID to a canonical JID string.
 * "  +91 987 654 3210  " → "919876543210@s.whatsapp.net"
 * "GROUP@g.us" → unchanged
 */
export function normaliseJid(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('@')) return trimmed; // Already a JID
  // Strip spaces, dashes, parens, leading +
  const digits = trimmed.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  return `${digits}@s.whatsapp.net`;
}
