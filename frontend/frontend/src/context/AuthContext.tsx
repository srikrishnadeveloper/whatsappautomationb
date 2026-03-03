/**
 * Authentication Context - Supabase Version with Google OAuth
 * Manages user authentication state using Supabase Auth
 * Supports only Google Sign-In (with Gmail scopes)
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../config/supabase';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { API_BASE, authFetch } from '../services/api';

interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  provider?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// localStorage key for cached Google tokens (survives backend downtime)
const gmailCacheKey = (userId: string) => `ml_gmail_tokens_${userId}`;

interface CachedGmailTokens {
  accessToken: string;
  refreshToken: string | null;
  googleEmail: string | null;
  savedAt: number;
}

/** Persist Google OAuth tokens to localStorage immediately — backend-independent */
function cacheGmailTokens(userId: string, tokens: CachedGmailTokens) {
  try { localStorage.setItem(gmailCacheKey(userId), JSON.stringify(tokens)); } catch {}
}

/** Read cached Google tokens for a user */
export function readCachedGmailTokens(userId: string): CachedGmailTokens | null {
  try {
    const raw = localStorage.getItem(gmailCacheKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Remove cached tokens after successful backend save or on disconnect */
export function clearCachedGmailTokens(userId: string) {
  try { localStorage.removeItem(gmailCacheKey(userId)); } catch {}
}

function mapSupabaseUser(sbUser: SupabaseUser): User {
  return {
    id: sbUser.id,
    email: sbUser.email || '',
    fullName: sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || '',
    avatarUrl: sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture,
    provider: sbUser.app_metadata?.provider || 'google',
  };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Gmail token persistence ──────────────────────────────────────────────

  /**
   * Push Gmail tokens to the backend.
   * Accepts either a fresh Supabase Session (has provider_token) or a
   * CachedGmailTokens object read from localStorage.
   * ALWAYS writes to localStorage first so tokens survive a backend outage.
   */
  const saveProviderTokens = useCallback(async (
    sessionOrCached: Session | CachedGmailTokens,
    supabaseAccessToken?: string,
    explicitUserId?: string
  ) => {
    let bearerToken: string;
    let payload: { accessToken: string; refreshToken: string | null; googleEmail: string | null; expiresIn: number };
    let userId: string | undefined;

    if ('provider_token' in sessionOrCached) {
      // Full Supabase Session object
      if (!sessionOrCached.provider_token) return;
      bearerToken = sessionOrCached.access_token;
      userId = sessionOrCached.user?.id;
      payload = {
        accessToken: sessionOrCached.provider_token,
        refreshToken: sessionOrCached.provider_refresh_token || null,
        googleEmail: sessionOrCached.user?.email || null,
        expiresIn: 3600,
      };
      // 1️⃣ Cache in localStorage FIRST — independent of backend availability
      if (userId) {
        cacheGmailTokens(userId, {
          accessToken: sessionOrCached.provider_token,
          refreshToken: sessionOrCached.provider_refresh_token || null,
          googleEmail: sessionOrCached.user?.email || null,
          savedAt: Date.now(),
        });
      }
    } else {
      // CachedGmailTokens from localStorage — need a Supabase bearer token
      if (!supabaseAccessToken) return;
      bearerToken = supabaseAccessToken;
      userId = explicitUserId; // passed from call site where userId is known
      payload = { ...sessionOrCached, expiresIn: 3600 };
    }

    // 2️⃣ Try to persist to backend (idempotent upsert)
    try {
      const res = await fetch(`${API_BASE}/gmail/save-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        console.log('Gmail tokens saved to backend');
        // 3️⃣ Clear localStorage cache — backend is now the canonical store
        if (userId) clearCachedGmailTokens(userId);
      }
    } catch {
      // Backend offline — tokens are safely in localStorage, will auto-retry on next load
      console.warn('Backend offline — Gmail tokens queued in localStorage');
    }
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (currentSession?.user) {
        setSession(currentSession);
        setUser(mapSupabaseUser(currentSession.user));
        if (currentSession.provider_token) {
          // Fresh Google token available (just redirected from OAuth) — save it
          saveProviderTokens(currentSession);
        } else {
          // No provider_token in current Supabase session — retry any queued localStorage tokens
          const cached = readCachedGmailTokens(currentSession.user.id);
          if (cached) {
            console.log('📧 Retrying queued Gmail token save...');
            saveProviderTokens(cached, currentSession.access_token, currentSession.user.id);
          }
        }
      }
      setLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (newSession?.user) {
          setSession(newSession);
          setUser(mapSupabaseUser(newSession.user));
          if (newSession.provider_token && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
            // Fresh Google token from OAuth redirect — save it
            saveProviderTokens(newSession);
          } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            // Retry localStorage-cached tokens on every sign-in / token refresh
            const cached = readCachedGmailTokens(newSession.user.id);
            if (cached) {
              console.log('📧 Retrying queued Gmail token save on auth event...');
              saveProviderTokens(cached, newSession.access_token, newSession.user.id);
            }
          }
        } else {
          setSession(null);
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [saveProviderTokens]);

  // Login with Google OAuth (includes Gmail read scope)
  const loginWithGoogle = useCallback(async (): Promise<boolean> => {
    setError(null);
    setLoading(true);
    
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          scopes: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.labels',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (oauthError) throw oauthError;

      // OAuth redirects the browser — no need to set state here
      // The onAuthStateChange listener will handle it after redirect
      return true;
    } catch (e: any) {
      console.error('Google login error:', e);
      setError(e.message || 'Google sign-in failed');
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
    loginWithGoogle,
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
