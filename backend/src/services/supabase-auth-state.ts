/**
 * Supabase Auth State for Baileys
 * Persists WhatsApp session credentials in Supabase whatsapp_sessions table
 * Falls back to local filesystem if Supabase is unavailable
 */

import { getSupabaseClient, hasSupabaseCredentials } from '../config/supabase';
import { proto } from '@whiskeysockets/baileys';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import * as fs from 'fs';
import * as path from 'path';

const SESSION_DIR = path.join(__dirname, '../../_IGNORE_session');

interface AuthState {
  state: {
    creds: any;
    keys: {
      get: (type: string, ids: string[]) => Promise<Record<string, any>>;
      set: (data: Record<string, Record<string, any>>) => Promise<void>;
    };
  };
  saveCreds: () => Promise<void>;
  clearSession: () => Promise<void>;
}

/**
 * Create a Supabase-backed auth state for Baileys.
 * Stores credentials in the whatsapp_sessions.session_data JSONB column.
 * Uses local filesystem as a fast cache and Supabase as persistent backup.
 */
export async function useSupabaseAuthState(userId: string): Promise<AuthState> {
  const useSupabase = hasSupabaseCredentials();
  const sessionKey = `wa_session_${userId}`;
  const localDir = path.join(SESSION_DIR, userId.replace(/[^a-zA-Z0-9_-]/g, '_'));

  // Ensure local session dir exists
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  // Load or create credentials
  let creds: any;
  let keys: Record<string, any> = {};

  // Try loading from Supabase first, then local filesystem
  if (useSupabase) {
    try {
      const db = getSupabaseClient();
      const { data } = await db
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('user_id', userId)
        .single();

      if (data?.session_data) {
        const sessionData = typeof data.session_data === 'string'
          ? JSON.parse(data.session_data, BufferJSON.reviver)
          : JSON.parse(JSON.stringify(data.session_data), BufferJSON.reviver);

        creds = sessionData.creds || initAuthCreds();
        // Pre-load ALL signal keys into memory so they're immediately available
        if (sessionData.keys && typeof sessionData.keys === 'object') {
          keys = sessionData.keys;
        }
        console.log(`✅ WhatsApp session loaded from Supabase for user ${userId}`);
      }
    } catch (e: any) {
      console.log(`⚠️ Could not load session from Supabase: ${e.message}`);
    }
  }

  // Fallback: load from local filesystem
  if (!creds) {
    // Try new session.json (full creds + keys combined) first — written since v2.1
    const sessionFile = path.join(localDir, 'session.json');
    const credsFile   = path.join(localDir, 'creds.json');

    if (fs.existsSync(sessionFile)) {
      try {
        const raw = fs.readFileSync(sessionFile, 'utf-8');
        const stored = JSON.parse(raw, BufferJSON.reviver);
        creds = stored.creds || initAuthCreds();
        // Restore keys into the in-memory map so get() never needs the individual files
        if (stored.keys && typeof stored.keys === 'object') {
          keys = stored.keys;
        }
        console.log(`✅ WhatsApp session loaded from session.json for user ${userId}`);
      } catch (e) {
        console.log('⚠️ Failed to read session.json, falling back to creds.json');
        creds = null as any;
      }
    }

    // Backward-compat: load legacy creds.json (no keys stored there)
    if (!creds && fs.existsSync(credsFile)) {
      try {
        const raw = fs.readFileSync(credsFile, 'utf-8');
        creds = JSON.parse(raw, BufferJSON.reviver);
        console.log(`✅ WhatsApp creds loaded from creds.json for user ${userId} (keys loaded lazily)`);
      } catch (e) {
        console.log('⚠️ Failed to read local creds, creating new session');
        creds = initAuthCreds();
      }
    } else if (!creds) {
      creds = initAuthCreds();
      console.log(`🆕 New WhatsApp session created for user ${userId}`);
    }
  }

  // Save session to both local and Supabase
  const saveState = async () => {
    // Serialise the full in-memory state (creds + every signal key) in one shot.
    // This is the canonical save format from v2.1 onwards.
    const sessionData = JSON.parse(JSON.stringify({ creds, keys }, BufferJSON.replacer));

    // ── 1. Local filesystem (fast, always attempted first) ──────────────────
    try {
      // session.json  — full state (creds + keys).  Single authoritative file.
      const sessionFile = path.join(localDir, 'session.json');
      fs.writeFileSync(sessionFile, JSON.stringify(sessionData));

      // Keep creds.json for backward compatibility with older code / manual inspection
      const credsFile = path.join(localDir, 'creds.json');
      fs.writeFileSync(credsFile, JSON.stringify(creds, BufferJSON.replacer, 2));
    } catch (e: any) {
      console.error('⚠️ Local session save failed:', e.message);
    }

    // ── 2. Supabase (persistent across redeploys / machine changes) ─────────
    if (useSupabase) {
      try {
        const db = getSupabaseClient(); // uses service-role key when configured → bypasses RLS
        await db
          .from('whatsapp_sessions')
          .upsert({
            user_id: userId,
            session_data: sessionData,
            is_connected: true,
            last_connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
      } catch (e: any) {
        // Non-fatal — local file is the fallback
        console.warn('⚠️ Supabase session save failed (local file is backup):', e.message);
      }
    }
  };

  // Clear session from both stores
  const clearSession = async () => {
    // Clear local
    try {
      if (fs.existsSync(localDir)) {
        const files = fs.readdirSync(localDir);
        files.forEach(f => fs.unlinkSync(path.join(localDir, f)));
        fs.rmdirSync(localDir);
      }
    } catch (e: any) {
      console.error('⚠️ Local session clear failed:', e.message);
    }

    // Clear Supabase
    if (useSupabase) {
      try {
        const db = getSupabaseClient();
        await db
          .from('whatsapp_sessions')
          .update({
            session_data: null,
            is_connected: false,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      } catch (e: any) {
        console.error('⚠️ Supabase session clear failed:', e.message);
      }
    }

    creds = initAuthCreds();
    keys = {};
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const result: Record<string, any> = {};
          for (const id of ids) {
            const key = `${type}-${id}`;
            // Try in-memory first
            if (keys[key]) {
              result[id] = keys[key];
            } else {
              // Try local file
              const keyFile = path.join(localDir, `${key}.json`);
              if (fs.existsSync(keyFile)) {
                try {
                  const raw = fs.readFileSync(keyFile, 'utf-8');
                  result[id] = JSON.parse(raw, BufferJSON.reviver);
                  keys[key] = result[id]; // cache in memory
                } catch (e) {
                  // Key not found, skip
                }
              }
            }
          }
          return result;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          for (const [type, typeData] of Object.entries(data)) {
            for (const [id, value] of Object.entries(typeData || {})) {
              const key = `${type}-${id}`;
              if (value) {
                keys[key] = value;
                // Save to local file
                try {
                  const keyFile = path.join(localDir, `${key}.json`);
                  fs.writeFileSync(keyFile, JSON.stringify(value, BufferJSON.replacer, 2));
                } catch (e) {
                  // Ignore write errors for individual keys
                }
              } else {
                delete keys[key];
                try {
                  const keyFile = path.join(localDir, `${key}.json`);
                  if (fs.existsSync(keyFile)) fs.unlinkSync(keyFile);
                } catch (e) {
                  // Ignore
                }
              }
            }
          }
        },
      },
    },
    saveCreds: saveState,
    clearSession,
  };
}
