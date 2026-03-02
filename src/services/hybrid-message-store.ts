/**
 * Hybrid Message Store
 * Uses Supabase when credentials are available, falls back to in-memory storage
 */

import { StoredMessage } from './message-store';
import { hasSupabaseCredentials } from '../config/supabase';

// In-memory fallback store
class InMemoryMessageStore {
  private messages: Map<string, StoredMessage> = new Map();
  private idCounter: number = 1;

  add(message: Omit<StoredMessage, 'id' | 'created_at'>): StoredMessage {
    const id = `msg-${Date.now()}-${this.idCounter++}`;
    const storedMessage: StoredMessage = {
      ...message,
      id,
      created_at: new Date().toISOString()
    };
    this.messages.set(id, storedMessage);
    
    // Keep only last 1000 messages
    if (this.messages.size > 1000) {
      const firstKey = this.messages.keys().next().value;
      if (firstKey) this.messages.delete(firstKey);
    }
    
    return storedMessage;
  }

  get(id: string): StoredMessage | undefined {
    return this.messages.get(id);
  }

  getAll(filters?: {
    classification?: string;
    decision?: string;
    priority?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): { data: StoredMessage[]; total: number } {
    let messages = Array.from(this.messages.values()).reverse();

    if (filters?.classification) {
      messages = messages.filter(m => m.classification === filters.classification);
    }
    if (filters?.decision) {
      messages = messages.filter(m => m.decision === filters.decision);
    }
    if (filters?.priority) {
      messages = messages.filter(m => m.priority === filters.priority);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      messages = messages.filter(m => 
        m.content.toLowerCase().includes(search) ||
        m.sender.toLowerCase().includes(search)
      );
    }

    const total = messages.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    messages = messages.slice(offset, offset + limit);

    return { data: messages, total };
  }

  update(id: string, updates: Partial<StoredMessage>): StoredMessage | null {
    const message = this.messages.get(id);
    if (!message) return null;
    const updated = { ...message, ...updates };
    this.messages.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.messages.delete(id);
  }

  getStats(): any {
    const messages = Array.from(this.messages.values());
    const stats = {
      total: messages.length,
      byClassification: {} as Record<string, number>,
      byDecision: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      bySender: {} as Record<string, number>,
      recentMessages: messages.slice(-10).reverse()
    };

    messages.forEach(m => {
      if (m.classification) {
        stats.byClassification[m.classification] = (stats.byClassification[m.classification] || 0) + 1;
      }
      if (m.decision) {
        stats.byDecision[m.decision] = (stats.byDecision[m.decision] || 0) + 1;
      }
      if (m.priority) {
        stats.byPriority[m.priority] = (stats.byPriority[m.priority] || 0) + 1;
      }
      stats.bySender[m.sender] = (stats.bySender[m.sender] || 0) + 1;
    });

    return stats;
  }

  clear(): void {
    this.messages.clear();
  }
}

// Create the hybrid store — tries Supabase first, falls back to in-memory
class HybridMessageStore {
  private inMemoryStore = new InMemoryMessageStore();
  private supabaseStore: any = null;
  private useSupabase: boolean = false;
  private initialized: boolean = false;

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (hasSupabaseCredentials()) {
      try {
        const { supabaseMessageStore } = await import('./supabase-message-store');
        this.supabaseStore = supabaseMessageStore;
        this.useSupabase = true;
        console.log('✅ Hybrid Store: Using Supabase for messages');
      } catch (error) {
        console.log('⚠️ Hybrid Store: Supabase failed, using in-memory storage');
        this.useSupabase = false;
      }
    } else {
      console.log('📦 Hybrid Store: Using in-memory storage (no Supabase credentials)');
      this.useSupabase = false;
    }
  }

  async add(message: Omit<StoredMessage, 'id' | 'created_at'>, userId?: string): Promise<StoredMessage> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore && userId) {
      try {
        const result = await this.supabaseStore.add(message, userId);
        console.log(`💾 Message SAVED to Supabase (ID: ${result.id}, User: ${userId})`);
        return result;
      } catch (error: any) {
        console.error('❌ Supabase save failed:', error.message);
        this.useSupabase = false;
      }
    }
    
    const result = this.inMemoryStore.add(message);
    console.log(`📦 Message saved to IN-MEMORY (ID: ${result.id}) - Will be lost on restart!`);
    return result;
  }

  async existsByMessageKey(messageKey: string, userId?: string): Promise<boolean> {
    await this.initialize();

    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.existsByMessageKey(messageKey, userId);
      } catch {
        return false;
      }
    }
    return false;
  }

  async get(id: string, userId?: string): Promise<StoredMessage | undefined> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.get(id, userId);
      } catch (error: any) {
        console.error('Supabase get failed:', error.message);
      }
    }
    
    return this.inMemoryStore.get(id);
  }

  async getAll(filters?: {
    classification?: string;
    decision?: string;
    priority?: string;
    search?: string;
    limit?: number;
    offset?: number;
    userId?: string;
  }): Promise<{ data: StoredMessage[]; total: number }> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.getAll(filters);
      } catch (error: any) {
        console.error('Supabase getAll failed:', error.message);
        this.useSupabase = false;
      }
    }
    
    return this.inMemoryStore.getAll(filters);
  }

  async update(id: string, updates: Partial<StoredMessage>, userId?: string): Promise<StoredMessage | null> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.update(id, updates, userId);
      } catch (error: any) {
        console.error('Supabase update failed:', error.message);
      }
    }
    
    return this.inMemoryStore.update(id, updates);
  }

  async delete(id: string, userId?: string): Promise<boolean> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.delete(id, userId);
      } catch (error: any) {
        console.error('Supabase delete failed:', error.message);
      }
    }
    
    return this.inMemoryStore.delete(id);
  }

  async getStats(userId?: string): Promise<any> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.getStats(userId);
      } catch (error: any) {
        console.error('Supabase getStats failed:', error.message);
      }
    }
    
    return this.inMemoryStore.getStats();
  }

  async clear(userId?: string): Promise<void> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore && userId) {
      try {
        await this.supabaseStore.clear(userId);
        return;
      } catch (error: any) {
        console.error('Supabase clear failed:', error.message);
      }
    }
    
    this.inMemoryStore.clear();
  }

  async clearAll(userId?: string): Promise<number> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore && userId) {
      try {
        const countBefore = await this.supabaseStore.count(userId);
        await this.supabaseStore.clear(userId);
        console.log(`🗑️ Cleared ${countBefore} messages from Supabase`);
        return countBefore;
      } catch (error: any) {
        console.error('Supabase clearAll failed:', error.message);
      }
    }
    
    // In-memory clear
    const messages = this.inMemoryStore.getAll({ limit: 10000 });
    const count = messages.total;
    this.inMemoryStore.clear();
    console.log(`🗑️ Cleared ${count} messages from in-memory`);
    return count;
  }

  getStorageType(): string {
    return this.useSupabase ? 'supabase' : 'in-memory';
  }
}

// Export singleton instance
export const hybridMessageStore = new HybridMessageStore();
