/**
 * Supabase Auth Routes
 * Registration, login, token verification, profile management
 */

import { Router, Request, Response } from 'express';
import { getSupabaseClient, supabaseAdmin, hasSupabaseCredentials } from '../config/supabase';
import { requireAuth } from '../middleware/auth-supabase';

const router = Router();

// POST /api/auth/register — Create new user (auto-confirmed, seamless login)
router.post('/register', async (req: Request, res: Response) => {
  try {
    if (!hasSupabaseCredentials()) {
      return res.status(503).json({ error: true, message: 'Auth service not configured' });
    }

    const { email, password, fullName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: true, message: 'Email and password required' });
    }

    const db = getSupabaseClient();
    const adminDb = supabaseAdmin || db;

    // ---- Strategy 1: Use admin API if service role key is available ----
    if (supabaseAdmin) {
      try {
        const { data: adminUser, error: adminError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,  // Auto-confirm email
          user_metadata: { full_name: fullName || '' },
        });

        if (!adminError && adminUser?.user) {
          // Create profile
          await adminDb.from('profiles').upsert({
            id: adminUser.user.id, email: adminUser.user.email || email,
            full_name: fullName || null,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

          // Auto-login
          const { data: loginData, error: loginError } = await db.auth.signInWithPassword({ email, password });
          if (!loginError && loginData?.session) {
            return res.status(201).json({
              success: true,
              user: { id: adminUser.user.id, email: adminUser.user.email, fullName: fullName || null },
              session: {
                accessToken: loginData.session.access_token,
                refreshToken: loginData.session.refresh_token,
                expiresAt: loginData.session.expires_at,
              },
            });
          }

          // Admin create worked but auto-login failed
          return res.status(201).json({
            success: true,
            user: { id: adminUser.user.id, email: adminUser.user.email, fullName: fullName || null },
            session: null,
            message: 'Account created. Please log in.',
          });
        }
        // If admin create failed, fall through to standard signup
        console.warn('Admin createUser failed, trying standard signup:', adminError?.message);
      } catch (e: any) {
        console.warn('Admin API not available:', e.message);
      }
    }

    // ---- Strategy 2: Standard signUp ----
    const { data: authData, error: authError } = await db.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName || '' } },
    });

    if (authError) {
      return res.status(400).json({ error: true, message: authError.message });
    }
    if (!authData.user) {
      return res.status(400).json({ error: true, message: 'User creation failed' });
    }

    // Create profile
    await adminDb.from('profiles').upsert({
      id: authData.user.id, email: authData.user.email || email,
      full_name: fullName || null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    // If session already returned (email confirm disabled), use it
    if (authData.session) {
      return res.status(201).json({
        success: true,
        user: { id: authData.user.id, email: authData.user.email, fullName: fullName || null },
        session: {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          expiresAt: authData.session.expires_at,
        },
      });
    }

    // Try auto-login (works if email confirmation is disabled or user was auto-confirmed)
    try {
      const { data: loginData, error: loginError } = await db.auth.signInWithPassword({ email, password });
      if (!loginError && loginData?.session) {
        return res.status(201).json({
          success: true,
          user: { id: authData.user.id, email: authData.user.email, fullName: fullName || null },
          session: {
            accessToken: loginData.session.access_token,
            refreshToken: loginData.session.refresh_token,
            expiresAt: loginData.session.expires_at,
          },
        });
      }
    } catch (e) {
      // Ignore auto-login failure
    }

    // No session available — tell frontend
    res.status(201).json({
      success: true,
      user: { id: authData.user.id, email: authData.user.email, fullName: fullName || null },
      session: null,
      message: 'Account created. Please check your email or log in.',
    });
  } catch (err: any) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: true, message: 'Registration failed' });
  }
});

// POST /api/auth/login — Sign in and get tokens
router.post('/login', async (req: Request, res: Response) => {
  try {
    if (!hasSupabaseCredentials()) {
      return res.status(503).json({ error: true, message: 'Auth service not configured' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: true, message: 'Email and password required' });
    }

    const db = getSupabaseClient();
    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return res.status(401).json({ error: true, message: error?.message || 'Login failed' });
    }

    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.user_metadata?.full_name || '',
      },
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: true, message: 'Login failed' });
  }
});

// POST /api/auth/verify-token — Verify a token and return user info
router.post('/verify-token', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.body.token;
    if (!token) {
      return res.status(401).json({ error: true, message: 'Token required' });
    }

    const db = getSupabaseClient();
    const { data, error } = await db.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: true, message: 'Invalid token' });
    }

    // Sync profile
    const adminDb = supabaseAdmin || db;
    await adminDb.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.user_metadata?.full_name || '',
        avatarUrl: data.user.user_metadata?.avatar_url || null,
      },
    });
  } catch (err: any) {
    console.error('Verify token error:', err.message);
    res.status(500).json({ error: true, message: 'Token verification failed' });
  }
});

// GET /api/auth/user — Get current user profile (requires auth)
router.get('/user', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = supabaseAdmin || getSupabaseClient();
    const { data } = await db
      .from('profiles')
      .select('*')
      .eq('id', req.userId!)
      .single();

    res.json({
      success: true,
      user: data ? {
        id: data.id,
        email: data.email,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        phone: data.phone,
        createdAt: data.created_at,
      } : {
        id: req.userId,
        email: req.user?.email,
        fullName: req.user?.fullName,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: 'Failed to get user' });
  }
});

// POST /api/auth/logout — Logout (stateless — just acknowledge)
router.post('/logout', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out' });
});

// PUT /api/auth/profile — Update profile (requires auth)
router.put('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fullName, avatarUrl, phone } = req.body;
    const db = supabaseAdmin || getSupabaseClient();

    const { data, error } = await db
      .from('profiles')
      .update({
        full_name: fullName,
        avatar_url: avatarUrl,
        phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.userId!)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: true, message: error.message });
    }

    res.json({
      success: true,
      user: {
        id: data.id,
        email: data.email,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        phone: data.phone,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: 'Profile update failed' });
  }
});

// DELETE /api/auth/account — Delete account (requires auth)
router.delete('/account', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = supabaseAdmin || getSupabaseClient();

    // Delete profile and cascade
    await db.from('profiles').delete().eq('id', req.userId!);

    // Delete auth user (requires admin client)
    if (supabaseAdmin) {
      await supabaseAdmin.auth.admin.deleteUser(req.userId!);
    }

    res.json({ success: true, message: 'Account deleted' });
  } catch (err: any) {
    res.status(500).json({ error: true, message: 'Account deletion failed' });
  }
});

// POST /api/auth/refresh — Refresh an expired token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: true, message: 'Refresh token required' });
    }

    const db = getSupabaseClient();
    const { data, error } = await db.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      return res.status(401).json({ error: true, message: error?.message || 'Refresh failed' });
    }

    res.json({
      success: true,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: 'Token refresh failed' });
  }
});

export default router;
