/**
 * Hybrid Action Items Store
 * Uses Supabase when credentials are available, falls back to in-memory storage
 */

import { hasSupabaseCredentials } from '../config/supabase';

export interface ActionItem {
  id: string;
  messageId: string | null;
  title: string;
  description: string | null;
  sender: string | null;
  chatName: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  category: 'work' | 'study' | 'personal' | 'urgent' | 'other';
  dueDate: string | null;
  dueTime: string | null;
  tags: string[];
  originalMessage: string | null;
  aiConfidence: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ActionItemStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
  todayDue: number;
  overdue: number;
}

// In-memory fallback store
class InMemoryActionItemsStore {
  private items: Map<string, ActionItem> = new Map();
  private idCounter: number = 1;

  async add(item: Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<ActionItem> {
    const id = `action-${Date.now()}-${this.idCounter++}`;
    const now = new Date().toISOString();
    const actionItem: ActionItem = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.items.set(id, actionItem);
    return actionItem;
  }

  async get(id: string): Promise<ActionItem | undefined> {
    return this.items.get(id);
  }

  async getAll(filters?: {
    status?: string;
    priority?: string;
    category?: string;
    search?: string;
    dueBefore?: string;
    dueAfter?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: ActionItem[]; total: number }> {
    let items = Array.from(this.items.values());

    if (filters?.status) {
      items = items.filter(i => i.status === filters.status);
    }
    if (filters?.priority) {
      items = items.filter(i => i.priority === filters.priority);
    }
    if (filters?.category) {
      items = items.filter(i => i.category === filters.category);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      items = items.filter(i => 
        i.title.toLowerCase().includes(search) ||
        (i.description?.toLowerCase().includes(search))
      );
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = items.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    items = items.slice(offset, offset + limit);

    return { data: items, total };
  }

  async update(id: string, updates: Partial<ActionItem>): Promise<ActionItem | null> {
    const item = this.items.get(id);
    if (!item) return null;
    const updated = { 
      ...item, 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    this.items.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async complete(id: string): Promise<ActionItem | null> {
    const item = this.items.get(id);
    if (!item) return null;
    const now = new Date().toISOString();
    const updated = { 
      ...item, 
      status: 'completed' as const,
      completedAt: now,
      updatedAt: now
    };
    this.items.set(id, updated);
    return updated;
  }

  async getStats(): Promise<ActionItemStats> {
    const items = Array.from(this.items.values());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const stats: ActionItemStats = {
      total: items.length,
      pending: items.filter(i => i.status === 'pending').length,
      inProgress: items.filter(i => i.status === 'in_progress').length,
      completed: items.filter(i => i.status === 'completed').length,
      cancelled: items.filter(i => i.status === 'cancelled').length,
      byPriority: {},
      byCategory: {},
      todayDue: 0,
      overdue: 0
    };

    items.forEach(item => {
      stats.byPriority[item.priority] = (stats.byPriority[item.priority] || 0) + 1;
      stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1;
      
      if (item.dueDate && item.status !== 'completed') {
        const dueDate = new Date(item.dueDate);
        if (dueDate < today) {
          stats.overdue++;
        } else if (dueDate.toDateString() === today.toDateString()) {
          stats.todayDue++;
        }
      }
    });

    return stats;
  }
}

// Hybrid store — tries Supabase first, falls back to in-memory
class HybridActionItemsStore {
  private inMemoryStore = new InMemoryActionItemsStore();
  private supabaseStore: any = null;
  private useSupabase: boolean = false;
  private initialized: boolean = false;

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (hasSupabaseCredentials()) {
      try {
        const { supabaseActionItems } = await import('./supabase-action-items');
        this.supabaseStore = supabaseActionItems;
        this.useSupabase = true;
        console.log('✅ Hybrid Store: Using Supabase for action items');
      } catch (error) {
        console.log('⚠️ Hybrid Store: Supabase action items failed, using in-memory');
        this.useSupabase = false;
      }
    } else {
      console.log('📦 Hybrid Store: Using in-memory storage for action items');
      this.useSupabase = false;
    }
  }

  async add(item: Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'>, userId?: string, jwt?: string): Promise<ActionItem> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        const result = await this.supabaseStore.create({
          ...item,
          title: item.title || 'Untitled',
        }, userId, jwt);
        console.log(`💾 Action item SAVED to Supabase (ID: ${result.id})`);
        return result;
      } catch (error: any) {
        console.error('❌ Supabase action item save failed (will retry next time):', error.message);
      }
    }
    
    const result = await this.inMemoryStore.add(item);
    console.log(`📦 Action item saved to IN-MEMORY (ID: ${result.id}) - Will be lost on restart!`);
    return result;
  }

  async createFromMessage(
    messageId: string | null,
    content: string,
    sender: string,
    chatName: string | null,
    classification: {
      category: string;
      priority: string;
      decision: string;
      suggestedTask?: string;
      deadline?: string;
    },
    userId?: string,
    jwt?: string
  ): Promise<ActionItem | null> {
    await this.initialize();

    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.createFromMessage(messageId, content, sender, chatName, classification, userId, jwt);
      } catch (error: any) {
        console.error('❌ Supabase createFromMessage failed:', error.message);
      }
    }

    // Fallback: create in-memory
    if (classification.decision === 'ignore') return null;
    return this.inMemoryStore.add({
      messageId,
      title: classification.suggestedTask || content.substring(0, 80),
      description: content.length > 100 ? content : null,
      sender,
      chatName,
      priority: (classification.priority as any) || 'medium',
      status: 'pending',
      category: (classification.category as any) || 'other',
      dueDate: null,
      dueTime: null,
      tags: [],
      originalMessage: content,
      aiConfidence: 0.5,
      completedAt: null,
    });
  }

  async get(id: string, userId?: string, jwt?: string): Promise<ActionItem | undefined> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.get(id, userId, jwt);
      } catch (error: any) {
        console.error('Supabase get failed:', error.message);
      }
    }
    
    return this.inMemoryStore.get(id);
  }

  async getAll(filters?: {
    status?: string;
    priority?: string;
    category?: string;
    search?: string;
    dueBefore?: string;
    dueAfter?: string;
    limit?: number;
    offset?: number;
    userId?: string;
    jwt?: string;
  }): Promise<{ data: ActionItem[]; total: number }> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.getAll(filters);
      } catch (error: any) {
        console.error('Supabase getAll failed (falling back to in-memory):', error.message);
      }
    }
    
    return this.inMemoryStore.getAll(filters);
  }

  async update(id: string, updates: Partial<ActionItem>, userId?: string, jwt?: string): Promise<ActionItem | null> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.update(id, updates, userId, jwt);
      } catch (error: any) {
        console.error('Supabase update failed:', error.message);
      }
    }
    
    return this.inMemoryStore.update(id, updates);
  }

  async delete(id: string, userId?: string, jwt?: string): Promise<boolean> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.delete(id, userId, jwt);
      } catch (error: any) {
        console.error('Supabase delete failed:', error.message);
      }
    }
    
    return this.inMemoryStore.delete(id);
  }

  async complete(id: string, userId?: string, jwt?: string): Promise<ActionItem | null> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.complete(id, userId, jwt);
      } catch (error: any) {
        console.error('Supabase complete failed:', error.message);
      }
    }
    
    return this.inMemoryStore.complete(id);
  }

  async getStats(userId?: string, jwt?: string): Promise<ActionItemStats> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore) {
      try {
        return await this.supabaseStore.getStats(userId, jwt);
      } catch (error: any) {
        console.error('Supabase getStats failed:', error.message);
      }
    }
    
    return this.inMemoryStore.getStats();
  }

  async clearAll(userId?: string, jwt?: string): Promise<number> {
    await this.initialize();
    
    if (this.useSupabase && this.supabaseStore && userId) {
      try {
        const statsBefore = await this.supabaseStore.getStats(userId, jwt);
        await this.supabaseStore.clear(userId, jwt);
        console.log(`🗑️ Cleared ${statsBefore.total} action items from Supabase`);
        return statsBefore.total;
      } catch (error: any) {
        console.error('Supabase clearAll failed:', error.message);
      }
    }
    
    // In-memory clear
    const items = await this.inMemoryStore.getAll({ limit: 10000 });
    const count = items.total;
    this.inMemoryStore = new InMemoryActionItemsStore();
    console.log(`🗑️ Cleared ${count} action items from in-memory`);
    return count;
  }

  getStorageType(): string {
    return this.useSupabase ? 'supabase' : 'in-memory';
  }
}

// Export singleton
export const hybridActionItems = new HybridActionItemsStore();
