/**
 * Supabase Auth Middleware
 * Verifies Supabase JWT tokens and sets req.userId / req.user
 */

import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient, hasSupabaseCredentials } from '../config/supabase';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        email: string;
        fullName?: string;
      };
    }
  }
}

/**
 * Extract token from Authorization header or query param (for SSE)
 */
function extractToken(req: Request): string | null {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Fallback: check query param (used by EventSource for SSE)
  const queryToken = req.query.token as string;
  if (queryToken) {
    return queryToken;
  }

  return null;
}

/**
 * requireAuth - Blocks request if not authenticated
 * Sets req.userId and req.user on success
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!hasSupabaseCredentials()) {
    res.status(503).json({ error: true, message: 'Auth service not configured' });
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: true, message: 'Authentication required. Provide a Bearer token.' });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      res.status(401).json({ error: true, message: 'Invalid or expired token' });
      return;
    }

    req.userId = data.user.id;
    req.user = {
      id: data.user.id,
      email: data.user.email || '',
      fullName: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
    };

    next();
  } catch (err: any) {
    console.error('Auth middleware error:', err.message);
    res.status(401).json({ error: true, message: 'Authentication failed' });
  }
}

/**
 * optionalAuth - Continues even without auth, but sets req.userId if token is valid
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token || !hasSupabaseCredentials()) {
    next();
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (!error && data?.user) {
      req.userId = data.user.id;
      req.user = {
        id: data.user.id,
        email: data.user.email || '',
        fullName: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
      };
    }
  } catch {
    // Silently continue without auth
  }

  next();
}
