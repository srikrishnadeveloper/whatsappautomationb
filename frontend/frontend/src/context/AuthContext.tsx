/**
 * Authentication Context - Supabase Version
 * Manages user authentication state using Supabase Auth
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../config/supabase';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { API_BASE } from '../services/api';

interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  emailConfirmed: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

function mapSupabaseUser(sbUser: SupabaseUser): User {
  return {
    id: sbUser.id,
    email: sbUser.email || '',
    fullName: sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || '',
    avatarUrl: sbUser.user_metadata?.avatar_url,
    emailConfirmed: !!sbUser.email_confirmed_at
  };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (currentSession?.user) {
        setSession(currentSession);
        setUser(mapSupabaseUser(currentSession.user));
      }
      setLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (newSession?.user) {
          setSession(newSession);
          setUser(mapSupabaseUser(newSession.user));
        } else {
          setSession(null);
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Login function
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setError(null);
    setLoading(true);

    // Dev bypass
    if (email === 'dev@local') {
      setUser({
        id: 'dev-user',
        email: 'dev@local',
        fullName: 'Dev User',
        emailConfirmed: true
      });
      setLoading(false);
      return true;
    }
    
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (authError) throw authError;

      if (data.session && data.user) {
        setSession(data.session);
        setUser(mapSupabaseUser(data.user));
      }
      
      setLoading(false);
      return true;
    } catch (e: any) {
      console.error('Login error:', e);
      setError(e.message || 'Login failed');
      setLoading(false);
      return false;
    }
  }, []);

  // Register function
  const register = useCallback(async (email: string, password: string, fullName?: string): Promise<boolean> => {
    setError(null);
    setLoading(true);
    
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName || '' }
        }
      });
      
      if (authError) throw authError;

      if (data.session && data.user) {
        setSession(data.session);
        setUser(mapSupabaseUser(data.user));
      } else if (data.user && !data.session) {
        // Email confirmation required
        setUser(mapSupabaseUser(data.user));
      }
      
      setLoading(false);
      return true;
    } catch (e: any) {
      console.error('Registration error:', e);
      setError(e.message || 'Registration failed');
      setLoading(false);
      return false;
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      // Notify backend
      if (session?.access_token) {
        try {
          await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });
        } catch (e) {
          console.error('Backend logout failed:', e);
        }
      }
      
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    } catch (e) {
      console.error('Logout error:', e);
    }
  }, [session]);

  // Get access token for API calls
  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (session?.access_token) {
      // Check if token is expired and refresh if needed
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || null;
    }
    return null;
  }, [session]);

  const clearError = useCallback(() => setError(null), []);

  const value = {
    user,
    session,
    loading,
    isLoading: loading,
    error,
    login,
    register,
    logout,
    getIdToken,
    clearError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper hook to get auth headers for API calls
export function useAuthHeaders() {
  const { session } = useAuth();
  const [headers, setHeaders] = useState<Record<string, string>>({});

  useEffect(() => {
    const getHeaders = async () => {
      if (session?.access_token) {
        // Refresh if needed
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        setHeaders(token ? { 'Authorization': `Bearer ${token}` } : {});
      } else {
        setHeaders({});
      }
    };
    getHeaders();
  }, [session]);

  return headers;
}
