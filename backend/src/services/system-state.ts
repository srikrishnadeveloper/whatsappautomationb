/**
 * System State Service — Production Grade
 * Tracks system uptime with millisecond precision, last active/disconnect timestamps,
 * and handles missed message detection on restart/reconnect.
 * Stores state in Supabase whatsapp_sessions table for persistence across restarts.
 */

import { getSupabaseClient, hasSupabaseCredentials } from '../config/supabase';
import log from './activity-log';

export interface SystemState {
  lastActiveTimestamp: Date;
  lastShutdownTimestamp: Date | null;
  /** Precise timestamp recorded on EVERY connection close (ms precision) */
  lastDisconnectTimestamp: Date | null;
  isOnline: boolean;
  startupCount: number;
  lastStartupTimestamp: Date | null;
  missedMessagesProcessed: number;
  userId?: string;
}

class SystemStateService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private currentState: SystemState | null = null;
  private userId: string | null = null;

  /**
   * Initialize system state on startup
   * Records startup time and checks for missed messages period
   */
  async initialize(userId?: string): Promise<{ 
    wasOffline: boolean; 
    offlineSince: Date | null;
    offlineDuration: number; // in seconds
  }> {
    this.userId = userId || 'default';
    
    try {
      if (!hasSupabaseCredentials()) {
        log.warning('System state', 'Supabase not configured, using volatile state');
        this.currentState = {
          lastActiveTimestamp: new Date(),
          lastShutdownTimestamp: null,
          lastDisconnectTimestamp: null,
          isOnline: true,
          startupCount: 1,
          lastStartupTimestamp: new Date(),
          missedMessagesProcessed: 0,
          userId: this.userId,
        };
        this.startHeartbeat();
        return { wasOffline: false, offlineSince: null, offlineDuration: 0 };
      }

      const db = getSupabaseClient();
      const stateKey = `system_state_${this.userId}`;
      
      // Try to read existing state from whatsapp_sessions
      const { data: existing } = await db
        .from('whatsapp_sessions')
        .select('value, updated_at')
        .eq('session_id', stateKey)
        .eq('key', 'heartbeat')
        .single();

      const now = new Date();
      let wasOffline = false;
      let offlineSince: Date | null = null;
      let offlineDuration = 0;

      if (existing?.value) {
        // Use the most precise timestamp available:
        // 1. lastDisconnectTimestamp (set on connection close — ms precision)
        // 2. lastActiveTimestamp (heartbeat — 30s precision)
        // 3. updated_at (DB row update)
        const disconnectTs = existing.value.lastDisconnectTimestamp 
          ? new Date(existing.value.lastDisconnectTimestamp)
          : null;
        const activeTs = existing.value.lastActiveTimestamp
          ? new Date(existing.value.lastActiveTimestamp)
          : null;
        const dbTs = existing.updated_at ? new Date(existing.updated_at) : null;
        
        // Pick the LATEST of disconnect and active timestamps
        const lastKnown = disconnectTs && activeTs
          ? (disconnectTs > activeTs ? disconnectTs : activeTs)
          : disconnectTs || activeTs || dbTs;
        
        if (lastKnown) {
          offlineSince = lastKnown;
          offlineDuration = Math.floor((now.getTime() - lastKnown.getTime()) / 1000);
          
          // Consider offline if more than 2 minutes since last heartbeat
          if (offlineDuration > 120) {
            wasOffline = true;
            log.warning('System was offline', 
              `Offline for ${Math.floor(offlineDuration / 60)}m ${offlineDuration % 60}s since ${lastKnown.toISOString()}`);
          }
        }

        this.currentState = {
          lastActiveTimestamp: now,
          lastShutdownTimestamp: activeTs || null,
          lastDisconnectTimestamp: disconnectTs || null,
          isOnline: true,
          startupCount: (existing.value.startupCount || 0) + 1,
          lastStartupTimestamp: now,
          missedMessagesProcessed: 0,
          userId: this.userId,
        };
      } else {
        // First time initialization
        this.currentState = {
          lastActiveTimestamp: now,
          lastShutdownTimestamp: null,
          lastDisconnectTimestamp: null,
          isOnline: true,
          startupCount: 1,
          lastStartupTimestamp: now,
          missedMessagesProcessed: 0,
          userId: this.userId,
        };
        log.info('System state initialized', 'First startup');
      }

      // Save initial state
      await this.saveState();

      // Start heartbeat
      this.startHeartbeat();

      log.success('System state service started', 
        wasOffline 
          ? `Was offline since ${offlineSince?.toISOString()} (${offlineDuration}s)` 
          : 'System was online'
      );

      return { wasOffline, offlineSince, offlineDuration };
    } catch (error: any) {
      log.error('System state init failed', error.message);
      // Still create local state even if Supabase fails
      this.currentState = {
        lastActiveTimestamp: new Date(),
        lastShutdownTimestamp: null,
        lastDisconnectTimestamp: null,
        isOnline: true,
        startupCount: 1,
        lastStartupTimestamp: new Date(),
        missedMessagesProcessed: 0,
        userId: this.userId || 'default',
      };
      this.startHeartbeat();
      return { wasOffline: false, offlineSince: null, offlineDuration: 0 };
    }
  }

  /**
   * Start heartbeat to update lastActiveTimestamp every 30 seconds
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      await this.updateLastActive();
    }, 30000);

    log.info('Heartbeat started', 'Updating every 30 seconds');
  }

  /**
   * Update the last active timestamp
   */
  async updateLastActive(): Promise<void> {
    if (!this.currentState) return;

    try {
      this.currentState.lastActiveTimestamp = new Date();
      await this.saveState();
    } catch (error: any) {
      // Silently handle heartbeat errors
      console.error('Heartbeat update failed:', error.message);
    }
  }

  /**
   * Record a precise disconnect timestamp (called on every connection close).
   * This is THE key timestamp for missed-message detection.
   */
  async recordDisconnect(): Promise<void> {
    if (!this.currentState) return;

    const now = new Date();
    this.currentState.lastDisconnectTimestamp = now;
    this.currentState.isOnline = false;

    log.info('Disconnect recorded', `Precise timestamp: ${now.toISOString()}`);
    await this.saveState();
  }

  /**
   * Get the offline boundary — the precise time after which messages are considered "missed".
   * Returns the LATEST of lastDisconnectTimestamp or lastActiveTimestamp.
   */
  getOfflineBoundary(): Date | null {
    if (!this.currentState) return null;

    const d = this.currentState.lastDisconnectTimestamp;
    const a = this.currentState.lastActiveTimestamp;

    if (d && a) return d > a ? d : a;
    return d || a || null;
  }

  /**
   * Save current state to Supabase whatsapp_sessions table
   */
  private async saveState(): Promise<void> {
    if (!this.currentState || !hasSupabaseCredentials()) return;

    try {
      const db = getSupabaseClient();
      const stateKey = `system_state_${this.userId}`;
      
      const stateValue = {
        lastActiveTimestamp: this.currentState.lastActiveTimestamp.toISOString(),
        lastShutdownTimestamp: this.currentState.lastShutdownTimestamp?.toISOString() || null,
        lastDisconnectTimestamp: this.currentState.lastDisconnectTimestamp?.toISOString() || null,
        isOnline: this.currentState.isOnline,
        startupCount: this.currentState.startupCount,
        lastStartupTimestamp: this.currentState.lastStartupTimestamp?.toISOString() || null,
        missedMessagesProcessed: this.currentState.missedMessagesProcessed,
        userId: this.userId,
      };

      await db
        .from('whatsapp_sessions')
        .upsert({
          session_id: stateKey,
          key: 'heartbeat',
          value: stateValue,
          user_id: this.userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'session_id,key' });
    } catch (error: any) {
      // Don't crash on save errors
      console.error('System state save failed:', error.message);
    }
  }

  /**
   * Record that we processed missed messages
   */
  async recordMissedMessagesProcessed(count: number): Promise<void> {
    if (!this.currentState) return;

    this.currentState.missedMessagesProcessed += count;
    await this.saveState();
    
    log.success('Missed messages processed', `Processed ${count} missed messages`);
  }

  /**
   * Get the last active timestamp (for checking missed messages)
   */
  async getLastActiveTimestamp(): Promise<Date | null> {
    try {
      if (!hasSupabaseCredentials()) return null;

      const db = getSupabaseClient();
      const stateKey = `system_state_${this.userId || 'default'}`;
      
      const { data } = await db
        .from('whatsapp_sessions')
        .select('value')
        .eq('session_id', stateKey)
        .eq('key', 'heartbeat')
        .single();

      if (data?.value?.lastDisconnectTimestamp) {
        return new Date(data.value.lastDisconnectTimestamp);
      }
      if (data?.value?.lastActiveTimestamp) {
        return new Date(data.value.lastActiveTimestamp);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current system state
   */
  getState(): SystemState | null {
    return this.currentState;
  }

  /**
   * Graceful shutdown - record shutdown + disconnect timestamp
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.currentState) {
      const now = new Date();
      this.currentState.isOnline = false;
      this.currentState.lastShutdownTimestamp = now;
      this.currentState.lastDisconnectTimestamp = now;
      await this.saveState();
      log.info('System shutdown recorded', `Timestamp: ${now.toISOString()}`);
    }
  }
}

export const systemState = new SystemStateService();
