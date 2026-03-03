/**
 * Gmail Routes
 * API endpoints for Gmail integration: sync, list, stats, tokens
 */

import { Router, Request, Response } from 'express';
import {
  saveGmailTokens,
  syncGmailMessages,
  getGmailMessages,
  getGmailStats,
  getGmailSyncStatus,
  hasGmailConnected,
  disconnectGmail,
  getGmailProfile,
} from '../services/gmail-service';
import { triggerUserSync } from '../services/gmail-auto-sync';

const router = Router();

// POST /api/gmail/save-tokens
// Frontend sends Google OAuth tokens after sign-in
router.post('/save-tokens', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { accessToken, refreshToken, expiresIn, googleEmail } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: true, message: 'accessToken required' });
    }

    // If no email provided, try to get it from Gmail profile
    let email = googleEmail;
    if (!email) {
      try {
        const profile = await getGmailProfile(accessToken);
        email = profile.emailAddress;
      } catch (e) {
        email = null;
      }
    }

    await saveGmailTokens(userId, accessToken, refreshToken || null, expiresIn || null, email, req.supabaseToken);

    // Trigger an immediate background sync so emails appear right away
    triggerUserSync(userId, req.supabaseToken).catch(err => {
      console.log('📧 Background sync after token save failed (non-critical):', err.message);
    });

    res.json({
      success: true,
      message: 'Gmail tokens saved',
      email,
    });
  } catch (err: any) {
    console.error('Save Gmail tokens error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to save Gmail tokens' });
  }
});

// POST /api/gmail/sync
// Trigger a Gmail sync for the authenticated user
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const maxMessages = Math.min(parseInt(req.body.maxMessages) || 25, 100);

    const result = await syncGmailMessages(userId, maxMessages, req.supabaseToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error('Gmail sync error:', err.message);
    // Detect expired / invalid Google token → send 401 so the client can prompt reconnect
    const isTokenErr =
      err.message?.includes('(401)') ||
      err.message?.includes('(403)') ||
      err.message?.includes('No Gmail access token') ||
      err.message?.includes('token');
    if (isTokenErr) {
      return res.status(401).json({
        error: true,
        reconnect: true,
        message: 'Gmail token expired or missing. Please sign out and sign in again with Google to reconnect.',
      });
    }
    res.status(500).json({ error: true, message: err.message || 'Gmail sync failed' });
  }
});

// GET /api/gmail/messages
// List Gmail messages from DB
router.get('/messages', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { classification, decision, priority, search, limit, offset } = req.query;

    const result = await getGmailMessages(userId, {
      classification: classification as string,
      decision: decision as string,
      priority: priority as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    }, req.supabaseToken);

    res.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        hasMore: (result.data.length + (parseInt(offset as string) || 0)) < result.total,
      },
    });
  } catch (err: any) {
    console.error('Gmail messages error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to fetch Gmail messages' });
  }
});

// GET /api/gmail/stats
// Get Gmail classification stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const stats = await getGmailStats(userId, req.supabaseToken);

    res.json({ success: true, data: stats });
  } catch (err: any) {
    console.error('Gmail stats error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to get Gmail stats' });
  }
});

// GET /api/gmail/status
// Get Gmail connection & sync status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const status = await getGmailSyncStatus(userId, req.supabaseToken);

    res.json({ success: true, data: status });
  } catch (err: any) {
    console.error('Gmail status error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to get Gmail status' });
  }
});

// POST /api/gmail/disconnect
// Remove Gmail connection
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    await disconnectGmail(userId, req.supabaseToken);

    res.json({ success: true, message: 'Gmail disconnected' });
  } catch (err: any) {
    console.error('Gmail disconnect error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to disconnect Gmail' });
  }
});

// POST /api/gmail/check-new
// Quick sync + return latest messages count (used by frontend polling)
router.post('/check-new', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    // Light sync — only 10 messages
    const result = await triggerUserSync(userId, req.supabaseToken);
    res.json({ success: true, data: result });
  } catch (err: any) {
    // Token expired → nudge frontend to reconnect
    if (err.message?.includes('401') || err.message?.includes('403') || err.message?.includes('No Gmail access token')) {
      return res.status(401).json({ error: true, reconnect: true, message: 'Token expired' });
    }
    res.status(500).json({ error: true, message: err.message || 'Check failed' });
  }
});

// DELETE /api/gmail/messages
// Clear all synced Gmail messages for user
router.delete('/messages', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { getSupabaseClient, createAuthenticatedClient } = await import('../config/supabase');
    const db = req.supabaseToken ? createAuthenticatedClient(req.supabaseToken) : getSupabaseClient();

    await db.from('gmail_messages').delete().eq('user_id', userId);
    await db.from('gmail_sync_state').update({
      total_synced: 0,
      last_sync_at: null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);

    res.json({ success: true, message: 'Gmail messages cleared' });
  } catch (err: any) {
    console.error('Clear Gmail messages error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to clear Gmail messages' });
  }
});

export default router;
