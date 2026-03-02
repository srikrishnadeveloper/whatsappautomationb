/**
 * Supabase Action Items Service
 * Manages action items extracted from WhatsApp messages using Supabase (Postgres)
 * Every operation requires a userId for data isolation
 */

import { getSupabaseClient } from '../config/supabase';
import log from './activity-log';
import { EventEmitter } from 'events';

export interface ActionItem {
  id: string;
  messageId: string | null;
  title: string;
  description: string | null;
  sender: string;
  chatName: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  category: 'work' | 'study' | 'personal' | 'urgent' | 'other';
  dueDate: string | null;
  dueTime: string | null;
  tags: string[];
  originalMessage: string;
  aiConfidence: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  userId?: string;
}

export interface ActionItemStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  byPriority: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  byCategory: {
    work: number;
    study: number;
    personal: number;
    urgent: number;
    other: number;
  };
  todayDue: number;
  overdue: number;
}

class SupabaseActionItemsService extends EventEmitter {
  private get db() {
    return getSupabaseClient();
  }

  constructor() {
    super();
  }

  // Create action item from classified message
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
    userId?: string
  ): Promise<ActionItem | null> {
    if (classification.decision === 'ignore') return null;

    let dueDate: string | null = null;
    let dueTime: string | null = null;
    if (classification.deadline) {
      const parsed = this.parseDeadline(classification.deadline);
      dueDate = parsed.date;
      dueTime = parsed.time;
    }

    const tags = this.extractTags(content, classification.category);

    const row = {
      user_id: userId || null,
      message_id: messageId,
      title: classification.suggestedTask || this.generateTitle(content),
      description: content.length > 100 ? content : null,
      sender,
      chat_name: chatName,
      priority: this.mapPriority(classification.priority),
      status: 'pending',
      category: this.mapCategory(classification.category),
      due_date: dueDate ? dueDate.split('T')[0] : null,
      due_time: dueTime,
      tags,
      original_message: content,
      ai_confidence: classification.decision === 'create' ? 0.9 : 0.6,
      completed_at: null,
    };

    const { data, error } = await this.db
      .from('action_items')
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Action item insert failed: ${error.message}`);

    const actionItem = this.rowToActionItem(data);
    this.emit('created', actionItem);

    log.success('Action Item Created', actionItem.title, {
      id: data.id,
      priority: actionItem.priority,
      category: actionItem.category,
    });

    return actionItem;
  }

  // Create action item manually
  async create(itemData: Partial<ActionItem> & { title: string }, userId?: string): Promise<ActionItem> {
    const row = {
      user_id: userId || null,
      message_id: itemData.messageId || null,
      title: itemData.title,
      description: itemData.description || null,
      sender: itemData.sender || 'Manual',
      chat_name: itemData.chatName || null,
      priority: itemData.priority || 'medium',
      status: itemData.status || 'pending',
      category: itemData.category || 'other',
      due_date: itemData.dueDate ? itemData.dueDate.split('T')[0] : null,
      due_time: itemData.dueTime || null,
      tags: itemData.tags || [],
      original_message: itemData.originalMessage || '',
      ai_confidence: itemData.aiConfidence || 1.0,
      completed_at: null,
    };

    const { data, error } = await this.db
      .from('action_items')
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Action item create failed: ${error.message}`);

    const actionItem = this.rowToActionItem(data);
    this.emit('created', actionItem);
    return actionItem;
  }

  // Get single action item
  async get(id: string, userId?: string): Promise<ActionItem | undefined> {
    let query = this.db.from('action_items').select('*').eq('id', id);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query.single();
    if (error || !data) return undefined;
    return this.rowToActionItem(data);
  }

  // Get all action items with filters
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
  }): Promise<{ data: ActionItem[]; total: number }> {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    // Count query
    let countQuery = this.db.from('action_items').select('*', { count: 'exact', head: true });
    if (filters?.userId) countQuery = countQuery.eq('user_id', filters.userId);
    if (filters?.status) countQuery = countQuery.eq('status', filters.status);
    if (filters?.priority) countQuery = countQuery.eq('priority', filters.priority);
    if (filters?.category) countQuery = countQuery.eq('category', filters.category);
    if (filters?.dueBefore) countQuery = countQuery.lte('due_date', filters.dueBefore);
    if (filters?.dueAfter) countQuery = countQuery.gte('due_date', filters.dueAfter);
    if (filters?.search) {
      countQuery = countQuery.or(`title.ilike.%${filters.search}%,sender.ilike.%${filters.search}%,original_message.ilike.%${filters.search}%`);
    }

    const { count } = await countQuery;

    // Data query
    let query = this.db
      .from('action_items')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters?.userId) query = query.eq('user_id', filters.userId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.priority) query = query.eq('priority', filters.priority);
    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.dueBefore) query = query.lte('due_date', filters.dueBefore);
    if (filters?.dueAfter) query = query.gte('due_date', filters.dueAfter);
    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,sender.ilike.%${filters.search}%,original_message.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Action items query failed: ${error.message}`);

    return {
      data: (data || []).map(row => this.rowToActionItem(row)),
      total: count || 0,
    };
  }

  // Update action item
  async update(id: string, updates: Partial<ActionItem>, userId?: string): Promise<ActionItem | null> {
    const updateData: any = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate ? updates.dueDate.split('T')[0] : null;
    if (updates.dueTime !== undefined) updateData.due_time = updates.dueTime;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt;

    let query = this.db.from('action_items').update(updateData).eq('id', id);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query.select().single();
    if (error || !data) return null;

    const actionItem = this.rowToActionItem(data);
    this.emit('updated', actionItem);
    return actionItem;
  }

  // Mark complete
  async complete(id: string, userId?: string): Promise<ActionItem | null> {
    return this.update(id, { status: 'completed', completedAt: new Date().toISOString() }, userId);
  }

  // Delete action item
  async delete(id: string, userId?: string): Promise<boolean> {
    let query = this.db.from('action_items').delete().eq('id', id);
    if (userId) query = query.eq('user_id', userId);

    const { error } = await query;
    if (!error) this.emit('deleted', { id });
    return !error;
  }

  // Get statistics for a user
  async getStats(userId?: string): Promise<ActionItemStats> {
    let query = this.db.from('action_items').select('status, priority, category, due_date');
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;
    if (error) throw new Error(`Stats query failed: ${error.message}`);

    const items = data || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const stats: ActionItemStats = {
      total: items.length,
      pending: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      byPriority: { urgent: 0, high: 0, medium: 0, low: 0 },
      byCategory: { work: 0, study: 0, personal: 0, urgent: 0, other: 0 },
      todayDue: 0,
      overdue: 0,
    };

    items.forEach((item: any) => {
      switch (item.status) {
        case 'pending': stats.pending++; break;
        case 'in_progress': stats.inProgress++; break;
        case 'completed': stats.completed++; break;
        case 'cancelled': stats.cancelled++; break;
      }

      const p = item.priority as keyof typeof stats.byPriority;
      if (stats.byPriority[p] !== undefined) stats.byPriority[p]++;

      const c = item.category as keyof typeof stats.byCategory;
      if (stats.byCategory[c] !== undefined) stats.byCategory[c]++;

      if (item.due_date) {
        const dueStr = item.due_date.split('T')[0];
        if (dueStr === todayStr) stats.todayDue++;
        else if (dueStr < todayStr && item.status !== 'completed') stats.overdue++;
      }
    });

    return stats;
  }

  // Clear all action items for a specific user
  async clear(userId: string): Promise<void> {
    const { error } = await this.db.from('action_items').delete().eq('user_id', userId);
    if (error) throw new Error(`Clear failed: ${error.message}`);
  }

  // Helper methods
  private parseDeadline(deadline: string): { date: string | null; time: string | null } {
    try {
      const date = new Date(deadline);
      if (isNaN(date.getTime())) return { date: null, time: null };
      return {
        date: date.toISOString(),
        time: date.toTimeString().slice(0, 5),
      };
    } catch {
      return { date: null, time: null };
    }
  }

  private extractTags(content: string, category: string): string[] {
    const tags: string[] = [];
    if (category) tags.push(category);
    const words = content.toLowerCase().split(/\s+/);
    const keywords = ['urgent', 'asap', 'important', 'deadline', 'meeting', 'call', 'email', 'review'];
    words.forEach(word => {
      if (keywords.includes(word) && !tags.includes(word)) tags.push(word);
    });
    return tags.slice(0, 5);
  }

  private generateTitle(content: string): string {
    const cleaned = content.replace(/\n/g, ' ').trim();
    if (cleaned.length <= 80) return cleaned;
    return cleaned.slice(0, 77) + '...';
  }

  private mapPriority(priority: string): 'urgent' | 'high' | 'medium' | 'low' {
    const map: Record<string, 'urgent' | 'high' | 'medium' | 'low'> = { urgent: 'urgent', high: 'high', medium: 'medium', low: 'low' };
    return map[priority?.toLowerCase()] || 'medium';
  }

  private mapCategory(category: string): 'work' | 'study' | 'personal' | 'urgent' | 'other' {
    const map: Record<string, 'work' | 'study' | 'personal' | 'urgent' | 'other'> = { work: 'work', study: 'study', personal: 'personal', urgent: 'urgent', other: 'other' };
    return map[category?.toLowerCase()] || 'other';
  }

  private rowToActionItem(row: any): ActionItem {
    return {
      id: row.id,
      messageId: row.message_id,
      title: row.title,
      description: row.description,
      sender: row.sender,
      chatName: row.chat_name,
      priority: row.priority,
      status: row.status,
      category: row.category,
      dueDate: row.due_date,
      dueTime: row.due_time,
      tags: row.tags || [],
      originalMessage: row.original_message,
      aiConfidence: row.ai_confidence != null ? Number(row.ai_confidence) : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      userId: row.user_id,
    };
  }
}

export const supabaseActionItems = new SupabaseActionItemsService();
export default supabaseActionItems;
