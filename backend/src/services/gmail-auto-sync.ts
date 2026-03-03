/**
 * Gmail Auto-Sync Scheduler
 * Periodically syncs Gmail for all connected users.
 * Runs in the background on the backend server.
 */

import { getSupabaseClient } from '../config/supabase';
import { syncGmailMessages, getValidAccessToken } from './gmail-service';
import log from './activity-log';

const SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
let syncTimer: NodeJS.Timeout | null = null;
let isSyncing = false;

/**
 * Sync Gmail for all users who have valid tokens
 */
async function syncAllUsers(): Promise<void> {
  if (isSyncing) {
    console.log('📧 Gmail auto-sync: already running, skipping');
    return;
  }

  isSyncing = true;
  try {
    const db = getSupabaseClient();

    // Get all users with Gmail tokens
    const { data: tokenRows, error } = await db
      .from('gmail_tokens')
      .select('user_id, google_email');

    if (error || !tokenRows || tokenRows.length === 0) {
      return; // No users with Gmail connected
    }

    console.log(`📧 Gmail auto-sync: checking ${tokenRows.length} user(s)...`);

    for (const row of tokenRows) {
      try {
        // Check if token is valid (this will auto-refresh if needed)
        const token = await getValidAccessToken(row.user_id);
        if (!token) {
          console.log(`📧 Gmail auto-sync: skipping ${row.google_email || row.user_id} — no valid token`);
          continue;
        }

        // Sync last 10 messages (lightweight periodic check)
        const result = await syncGmailMessages(row.user_id, 15);
        if (result.synced > 0) {
          console.log(`📧 Gmail auto-sync: ${row.google_email || row.user_id} — ${result.synced} new, ${result.classified} classified`);
          log.info('Gmail Auto-Sync', `${row.google_email}: +${result.synced} emails`);
        }
      } catch (e: any) {
        // Don't let one user's error stop others
        console.error(`📧 Gmail auto-sync error for ${row.user_id}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error('📧 Gmail auto-sync global error:', e.message);
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the auto-sync scheduler
 */
export function startGmailAutoSync(): void {
  if (syncTimer) {
    console.log('📧 Gmail auto-sync already running');
    return;
  }

  console.log(`📧 Gmail auto-sync started (every ${SYNC_INTERVAL_MS / 1000}s)`);
  log.info('Gmail Auto-Sync', `Scheduler started — checking every ${SYNC_INTERVAL_MS / 1000}s`);

  // Run first sync after 30 seconds (let server finish starting)
  setTimeout(() => {
    syncAllUsers().catch(() => {});
  }, 30_000);

  // Then run periodically
  syncTimer = setInterval(() => {
    syncAllUsers().catch(() => {});
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop the auto-sync scheduler
 */
export function stopGmailAutoSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('📧 Gmail auto-sync stopped');
  }
}

/**
 * Force an immediate sync for a specific user (e.g. after connecting)
 */
export async function triggerUserSync(userId: string, userToken?: string): Promise<{ synced: number; classified: number; errors: number }> {
  try {
    return await syncGmailMessages(userId, 50, userToken);
  } catch (e: any) {
    console.error(`📧 Gmail manual sync error for ${userId}:`, e.message);
    throw e;
  }
}
