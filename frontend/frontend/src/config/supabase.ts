/**
 * Supabase Client Configuration
 * Frontend Supabase initialization for auth and client-side operations
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://houtddtglcbvlsdzwrnl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvdXRkZHRnbGNidmxzZHp3cm5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyMjIzMDAsImV4cCI6MjA3NDc5ODMwMH0.wAasm8o58aJH1GLBeHJCJz315r9ysSlGz6hkP6PUs1E';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'whatsapp_task_manager_auth',
  },
});

export default supabase;
