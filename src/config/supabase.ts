/**
 * Supabase Client Configuration
 * Primary database and auth provider for the WhatsApp Task Manager
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

// Create anon client (for RLS-protected operations)
if (supabaseUrl && supabaseUrl.startsWith('http') && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false // Server-side, no session persistence
    }
  });
  console.log('✅ Supabase client initialized');
} else {
  console.warn('⚠️  Warning: Supabase credentials not configured');
  console.warn('   Set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
}

// Create admin/service-role client (bypasses RLS for server-side operations)
if (supabaseUrl && supabaseUrl.startsWith('http') && supabaseServiceKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  console.log('✅ Supabase admin client initialized (service role)');
} else {
  // Fall back to anon client for admin operations
  supabaseAdmin = supabase;
  if (supabase) {
    console.log('ℹ️  Using anon key for admin operations (set SUPABASE_SERVICE_ROLE_KEY for production)');
  }
}

export { supabase, supabaseAdmin, supabaseUrl, supabaseAnonKey };

// Check if Supabase is properly configured
export function hasSupabaseCredentials(): boolean {
  return !!(supabaseUrl && supabaseUrl.startsWith('http') && supabaseAnonKey);
}

// Get a working Supabase client (prefer admin, fallback to anon)
export function getSupabaseClient(): SupabaseClient {
  const client = supabaseAdmin || supabase;
  if (!client) {
    throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
  }
  return client;
}

// Database types matching Supabase schema
export interface DbMessage {
  id?: string;
  user_id?: string;
  sender: string;
  chat_name: string | null;
  timestamp: string;
  content: string;
  message_type: string;
  classification: string | null;
  decision: string | null;
  priority: string | null;
  ai_reasoning: string | null;
  metadata: any;
  created_at?: string;
  updated_at?: string;
}

export interface DbActionItem {
  id?: string;
  user_id?: string;
  message_id: string | null;
  title: string;
  description: string | null;
  sender: string;
  chat_name: string | null;
  priority: string;
  status: string;
  category: string;
  due_date: string | null;
  due_time: string | null;
  tags: string[];
  original_message: string;
  ai_confidence: number;
  completed_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbRule {
  id?: string;
  user_id?: string;
  rule_type: string;
  contact_name: string | null;
  group_name: string | null;
  keywords: string[] | null;
  priority: string | null;
  category: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DbWhatsappSession {
  id?: string;
  user_id?: string;
  session_id: string;
  key: string;
  value: any;
  updated_at?: string;
}
