/**
 * Gmail Service
 * Fetches, syncs, and classifies Gmail messages using Google's REST API.
 * Uses OAuth tokens stored in Supabase gmail_tokens table.
 */

import { getSupabaseClient, createAuthenticatedClient } from '../config/supabase';
import { classifyWithAI, classifyWithRules } from './ai-classifier';
import log from './activity-log';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get the best available DB client.
 * If a user JWT is provided, creates an authenticated client so RLS sees auth.uid().
 * Otherwise falls back to the admin/anon client.
 */
function getDbClient(userToken?: string): SupabaseClient {
  if (userToken) {
    return createAuthenticatedClient(userToken);
  }
  return getSupabaseClient();
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Google OAuth client credentials (set via env)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// ─── Token Management ──────────────────────────────────────

interface GmailTokens {
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  google_email: string | null;
}

/**
 * Save Gmail OAuth tokens for a user
 */
export async function saveGmailTokens(
  userId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresIn: number | null,
  googleEmail: string | null,
  userToken?: string
): Promise<void> {
  const db = getDbClient(userToken);
  const tokenExpiry = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  const { error } = await db.from('gmail_tokens').upsert({
    user_id: userId,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expiry: tokenExpiry,
    scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.labels',
    google_email: googleEmail,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) {
    console.error('saveGmailTokens error:', error.message);
    throw new Error(`Failed to save Gmail tokens: ${error.message}`);
  }
}

/**
 * Get valid access token for a user (refreshes if expired)
 */
export async function getValidAccessToken(userId: string, userToken?: string): Promise<string | null> {
  const db = getDbClient(userToken);
  const { data: tokenRow, error } = await db
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !tokenRow) return null;

  // Check if token is still valid (with 5 min buffer)
  if (tokenRow.token_expiry) {
    const expiry = new Date(tokenRow.token_expiry).getTime();
    if (Date.now() < expiry - 5 * 60 * 1000) {
      return tokenRow.access_token;
    }
  }

  // Try to refresh
  if (tokenRow.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    try {
      console.log('🔄 Gmail: attempting token refresh...');
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: tokenRow.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { access_token: string; expires_in: number };
        await saveGmailTokens(
          userId,
          data.access_token,
          tokenRow.refresh_token, // keep existing refresh token
          data.expires_in,
          tokenRow.google_email,
          userToken  // pass user JWT so RLS allows the update
        );
        console.log('✅ Gmail: token refreshed successfully');
        return data.access_token;
      } else {
        const errBody = await res.text();
        console.error(`❌ Gmail token refresh failed (${res.status}):`, errBody);
      }
    } catch (e: any) {
      console.error('Token refresh failed:', e.message);
    }
  } else {
    console.warn('⚠️ Gmail: cannot refresh — missing', 
      !tokenRow.refresh_token ? 'refresh_token' : '',
      !GOOGLE_CLIENT_ID ? 'CLIENT_ID' : '',
      !GOOGLE_CLIENT_SECRET ? 'CLIENT_SECRET' : ''
    );
  }

  // Return existing token as last resort (it might still work)
  console.warn('⚠️ Gmail: returning expired token as last resort');
  return tokenRow.access_token;
}

/**
 * Check if a user has Gmail connected
 */
export async function hasGmailConnected(userId: string, userToken?: string): Promise<boolean> {
  const db = getDbClient(userToken);
  const { data } = await db
    .from('gmail_tokens')
    .select('id')
    .eq('user_id', userId)
    .single();
  return !!data;
}

/**
 * Remove Gmail connection for a user
 */
export async function disconnectGmail(userId: string, userToken?: string): Promise<void> {
  const db = getDbClient(userToken);
  await db.from('gmail_tokens').delete().eq('user_id', userId);
  await db.from('gmail_sync_state').delete().eq('user_id', userId);
}

// ─── Gmail API Calls ──────────────────────────────────────

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType: string;
  body: { data?: string; size: number };
  parts?: GmailMessagePart[];
}

interface GmailMessageFull {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: {
    headers: GmailMessageHeader[];
    mimeType: string;
    body: { data?: string; size: number };
    parts?: GmailMessagePart[];
  };
}

function getHeader(headers: GmailMessageHeader[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseFromHeader(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].replace(/"/g, '').trim(), email: match[2] };
  return { name: from, email: from };
}

function decodeBase64Url(data: string): string {
  try {
    const padded = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padded, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractTextBody(payload: GmailMessageFull['payload']): string {
  // Direct body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Recursive parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
      }
      // Nested multipart
      if (part.parts) {
        for (const sub of part.parts) {
          if (sub.mimeType === 'text/plain' && sub.body?.data) {
            return decodeBase64Url(sub.body.data);
          }
        }
      }
    }
  }
  return '';
}

/**
 * Fetch Gmail messages list
 */
async function gmailList(
  accessToken: string,
  query: string = '',
  maxResults: number = 20,
  pageToken?: string
): Promise<{ messages: { id: string; threadId: string }[]; nextPageToken?: string; resultSizeEstimate: number }> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    q: query || 'is:inbox',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`${GMAIL_API}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail list failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string; resultSizeEstimate?: number };
  return {
    messages: data.messages || [],
    nextPageToken: data.nextPageToken,
    resultSizeEstimate: data.resultSizeEstimate || 0,
  };
}

/**
 * Fetch a single Gmail message
 */
async function gmailGet(accessToken: string, messageId: string): Promise<GmailMessageFull> {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail get failed (${res.status}): ${err}`);
  }

  return (await res.json()) as GmailMessageFull;
}

/**
 * Get user's Gmail profile (email address)
 */
export async function getGmailProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Gmail profile failed (${res.status})`);
  return (await res.json()) as { emailAddress: string };
}

// ─── Sync & Classify ──────────────────────────────────────

/**
 * Sync recent Gmail messages for a user, classify them, and store in DB
 */
export async function syncGmailMessages(
  userId: string,
  maxMessages: number = 50,
  userToken?: string
): Promise<{ synced: number; classified: number; errors: number }> {
  const accessToken = await getValidAccessToken(userId, userToken);
  if (!accessToken) {
    throw new Error('No Gmail access token. Please reconnect Google.');
  }

  const db = getDbClient(userToken);

  // Get sync state
  const { data: syncState } = await db
    .from('gmail_sync_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  let synced = 0;
  let classified = 0;
  let errors = 0;

  try {
    // Always fetch last 3 days — Gmail's `after:` filter is date-granular and
    // misses same-day emails. Duplicates are skipped by the existing-message check below.
    const query = 'is:inbox newer_than:3d';

    const list = await gmailList(accessToken, query, maxMessages);

    if (!list.messages || list.messages.length === 0) {
      // Update sync timestamp even if no new messages
      const { error: syncErr } = await db.from('gmail_sync_state').upsert({
        user_id: userId,
        last_sync_at: new Date().toISOString(),
        sync_enabled: true,
        total_synced: syncState?.total_synced || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (syncErr) console.error('Sync state update error:', syncErr.message);

      return { synced: 0, classified: 0, errors: 0 };
    }

    // Fetch and process each message
    for (const msgRef of list.messages) {
      try {
        // Check if already synced
        const { data: existing } = await db
          .from('gmail_messages')
          .select('id')
          .eq('user_id', userId)
          .eq('gmail_id', msgRef.id)
          .single();

        if (existing) continue; // Skip already synced

        // Fetch full message
        const msg = await gmailGet(accessToken, msgRef.id);
        const headers = msg.payload.headers;
        const from = parseFromHeader(getHeader(headers, 'From'));
        const subject = getHeader(headers, 'Subject');
        const bodyText = extractTextBody(msg.payload);
        const hasAttachments = msg.payload.parts?.some(p => p.body?.size > 0 && p.mimeType !== 'text/plain' && p.mimeType !== 'text/html') || false;

        // Classify: use subject + first 500 chars of body (AI first, rule-based fallback)
        const classifyContent = `${subject}. ${bodyText.slice(0, 500)}`;
        let classification: any = null;

        try {
          // Try AI classification first for better accuracy
          classification = await classifyWithAI(classifyContent, from.name || from.email);
          classified++;
        } catch {
          // Fallback to rule-based if AI fails
          try {
            classification = classifyWithRules(classifyContent);
            classified++;
          } catch (e: any) {
            console.error('Gmail classify error:', e.message);
          }
        }

        // Store in DB
        const { error: upsertErr } = await db.from('gmail_messages').upsert({
          user_id: userId,
          gmail_id: msg.id,
          thread_id: msg.threadId,
          from_email: from.email,
          from_name: from.name,
          to_email: getHeader(headers, 'To'),
          subject,
          snippet: msg.snippet,
          body_text: bodyText.slice(0, 5000), // Limit body size
          labels: msg.labelIds,
          gmail_timestamp: new Date(parseInt(msg.internalDate)).toISOString(),
          is_read: !msg.labelIds.includes('UNREAD'),
          has_attachments: hasAttachments,
          classification: classification?.category || null,
          decision: classification?.decision || null,
          priority: classification?.priority || null,
          ai_reasoning: classification?.reasoning || null,
          metadata: {
            classifier_source: 'rule-based',
          },
        }, { onConflict: 'user_id,gmail_id' });

        if (upsertErr) {
          console.error(`Gmail message upsert error:`, upsertErr.message);
          errors++;
          continue;
        }

        synced++;

        // If this email is actionable, create an action item (skip if already exists)
        if (classification?.decision === 'create') {
          try {
            // Get the inserted/existing gmail_message id
            const { data: gmailRow } = await db
              .from('gmail_messages')
              .select('id')
              .eq('user_id', userId)
              .eq('gmail_id', msg.id)
              .single();

            if (gmailRow?.id) {
              // Check if action item already exists for this Gmail message
              const { data: existingAction } = await db
                .from('action_items')
                .select('id')
                .eq('gmail_message_id', gmailRow.id)
                .maybeSingle();

              if (!existingAction) {
                const { error: aiErr } = await db.from('action_items').insert({
                  user_id: userId,
                  title: subject || '(no subject)',
                  description: msg.snippet || bodyText.slice(0, 300),
                  sender: from.name || from.email,
                  priority: classification.priority || 'medium',
                  category: classification.category || 'work',
                  status: 'pending',
                  original_message: msg.snippet || '',
                  source: 'gmail',
                  gmail_message_id: gmailRow.id,
                });
                if (aiErr) console.error('Action item insert error:', aiErr.message);
              }
            }
          } catch (aiEx: any) {
            console.error('Action item creation error:', aiEx.message);
          }
        }
      } catch (e: any) {
        console.error(`Gmail message ${msgRef.id} sync error:`, e.message);
        errors++;
      }
    }

    // Update sync state
    const { error: syncErr } = await db.from('gmail_sync_state').upsert({
      user_id: userId,
      last_sync_at: new Date().toISOString(),
      sync_enabled: true,
      total_synced: (syncState?.total_synced || 0) + synced,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (syncErr) console.error('Sync state update error:', syncErr.message);

    log.success('Gmail Sync', `Synced ${synced} messages, classified ${classified}`);
  } catch (e: any) {
    console.error('Gmail sync error:', e.message);
    throw e;
  }

  return { synced, classified, errors };
}

/**
 * Get Gmail messages from DB for a user
 */
export async function getGmailMessages(
  userId: string,
  options: {
    classification?: string;
    decision?: string;
    priority?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
  userToken?: string
): Promise<{ data: any[]; total: number }> {
  const db = getDbClient(userToken);
  const limit = Math.min(options.limit || 50, 100);
  const offset = options.offset || 0;

  let query = db
    .from('gmail_messages')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('gmail_timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.classification) query = query.eq('classification', options.classification);
  if (options.decision) query = query.eq('decision', options.decision);
  if (options.priority) query = query.eq('priority', options.priority);
  if (options.search) {
    // Sanitize search input to prevent PostgREST filter injection
    const safe = options.search.replace(/[%,.*()]/g, '');
    if (safe) {
      query = query.or(`subject.ilike.%${safe}%,from_name.ilike.%${safe}%,snippet.ilike.%${safe}%`);
    }
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return { data: data || [], total: count || 0 };
}

/**
 * Get Gmail stats for a user
 */
export async function getGmailStats(userId: string, userToken?: string): Promise<any> {
  const db = getDbClient(userToken);

  const { data: messages } = await db
    .from('gmail_messages')
    .select('classification, decision, priority')
    .eq('user_id', userId);

  if (!messages || messages.length === 0) {
    return { total: 0, by_classification: {}, by_decision: {}, by_priority: {} };
  }

  const byClassification: Record<string, number> = {};
  const byDecision: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  for (const m of messages) {
    const cls = m.classification || 'unclassified';
    const dec = m.decision || 'unknown';
    const pri = m.priority || 'unknown';
    byClassification[cls] = (byClassification[cls] || 0) + 1;
    byDecision[dec] = (byDecision[dec] || 0) + 1;
    byPriority[pri] = (byPriority[pri] || 0) + 1;
  }

  return {
    total: messages.length,
    by_classification: byClassification,
    by_decision: byDecision,
    by_priority: byPriority,
  };
}

/**
 * Get sync status for a user
 */
export async function getGmailSyncStatus(userId: string, userToken?: string): Promise<any> {
  const db = getDbClient(userToken);
  const hasTokens = await hasGmailConnected(userId, userToken);

  const { data: syncState } = await db
    .from('gmail_sync_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  const { data: tokenData } = await db
    .from('gmail_tokens')
    .select('google_email, token_expiry, refresh_token')
    .eq('user_id', userId)
    .single();

  // Consider "connected" only if we have tokens AND either a valid token or a refresh_token
  let connected = hasTokens;
  if (connected && tokenData?.token_expiry) {
    const expired = new Date(tokenData.token_expiry).getTime() < Date.now();
    if (expired && !tokenData.refresh_token) {
      connected = false; // Expired and can't refresh → treat as disconnected
    }
  }

  return {
    connected,
    email: tokenData?.google_email || null,
    lastSyncAt: syncState?.last_sync_at || null,
    totalSynced: syncState?.total_synced || 0,
    syncEnabled: syncState?.sync_enabled ?? true,
  };
}
