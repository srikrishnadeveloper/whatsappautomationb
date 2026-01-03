/**
 * System State Service
 * Tracks system uptime, last active timestamp, and handles missed messages on restart
 * Stores state in Firebase for persistence across restarts
 */

import { db, admin, COLLECTIONS } from '../config/firebase';
import log from './activity-log';

const SYSTEM_STATE_DOC = 'system_state';
const SYSTEM_COLLECTION = 'system';

export interface SystemState {
  lastActiveTimestamp: Date;
  lastShutdownTimestamp: Date | null;
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
      const docRef = db.collection(SYSTEM_COLLECTION).doc(`${SYSTEM_STATE_DOC}_${this.userId}`);
      const doc = await docRef.get();
      
      const now = new Date();
      let wasOffline = false;
      let offlineSince: Date | null = null;
      let offlineDuration = 0;

      if (doc.exists) {
        const data = doc.data()!;
        const lastActive = data.lastActiveTimestamp?.toDate();
        
        if (lastActive) {
          offlineSince = lastActive;
          offlineDuration = Math.floor((now.getTime() - lastActive.getTime()) / 1000);
          
          // Consider offline if more than 2 minutes since last heartbeat
          if (offlineDuration > 120) {
            wasOffline = true;
            log.warning('System was offline', `Offline for ${Math.floor(offlineDuration / 60)} minutes`);
          }
        }

        // Update state with new startup
        this.currentState = {
          lastActiveTimestamp: now,
          lastShutdownTimestamp: lastActive || null,
          isOnline: true,
          startupCount: (data.startupCount || 0) + 1,
          lastStartupTimestamp: now,
          missedMessagesProcessed: 0,
          userId: this.userId
        };
      } else {
        // First time initialization
        this.currentState = {
          lastActiveTimestamp: now,
          lastShutdownTimestamp: null,
          isOnline: true,
          startupCount: 1,
          lastStartupTimestamp: now,
          missedMessagesProcessed: 0,
          userId: this.userId
        };
        log.info('System state initialized', 'First startup');
      }

      // Save initial state
      await this.saveState();

      // Start heartbeat to keep lastActiveTimestamp updated
      this.startHeartbeat();

      log.success('System state service started', 
        wasOffline 
          ? `Was offline since ${offlineSince?.toISOString()}` 
          : 'System was online'
      );

      return { wasOffline, offlineSince, offlineDuration };
    } catch (error: any) {
      log.error('System state init failed', error.message);
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

    // Update every 30 seconds
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
   * Save current state to Firestore
   */
  private async saveState(): Promise<void> {
    if (!this.currentState) return;

    const docRef = db.collection(SYSTEM_COLLECTION).doc(`${SYSTEM_STATE_DOC}_${this.userId}`);
    await docRef.set({
      lastActiveTimestamp: admin.firestore.Timestamp.fromDate(this.currentState.lastActiveTimestamp),
      lastShutdownTimestamp: this.currentState.lastShutdownTimestamp 
        ? admin.firestore.Timestamp.fromDate(this.currentState.lastShutdownTimestamp)
        : null,
      isOnline: this.currentState.isOnline,
      startupCount: this.currentState.startupCount,
      lastStartupTimestamp: this.currentState.lastStartupTimestamp
        ? admin.firestore.Timestamp.fromDate(this.currentState.lastStartupTimestamp)
        : null,
      missedMessagesProcessed: this.currentState.missedMessagesProcessed,
      userId: this.userId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
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
      const docRef = db.collection(SYSTEM_COLLECTION).doc(`${SYSTEM_STATE_DOC}_${this.userId || 'default'}`);
      const doc = await docRef.get();
      
      if (doc.exists) {
        const data = doc.data()!;
        return data.lastActiveTimestamp?.toDate() || null;
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
   * Graceful shutdown - record shutdown timestamp
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.currentState) {
      this.currentState.isOnline = false;
      this.currentState.lastShutdownTimestamp = new Date();
      await this.saveState();
      log.info('System shutdown recorded', 'State saved');
    }
  }
}

export const systemState = new SystemStateService();
