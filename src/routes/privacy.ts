/**
 * Privacy Routes
 * Manage per-user "ignored" contacts/groups — messages from these
 * senders are stored but never classified or turned into tasks.
 *
 * All routes require auth (applied in index.ts).
 */

import { Router, Request, Response } from 'express';
import {
  getBlockedSenders,
  blockSender,
  unblockSender,
  normaliseJid,
} from '../services/privacy-settings';

const router = Router();

// Helper: pull token from request (set by auth middleware)
function getToken(req: Request): string | undefined {
  return (req as any).supabaseToken as string | undefined;
}

// ── GET /api/privacy/blocked ─────────────────────────────────────────────────
router.get('/blocked', async (req: Request, res: Response) => {
  try {
    const userId   = req.userId!;
    const userToken = getToken(req);
    const list = await getBlockedSenders(userId, userToken);
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/privacy/blocked ────────────────────────────────────────────────
// Body: { jid: string, display_name?: string }
router.post('/blocked', async (req: Request, res: Response) => {
  try {
    const userId    = req.userId!;
    const userToken = getToken(req);
    const { jid, display_name } = req.body;

    if (!jid || typeof jid !== 'string' || !jid.trim()) {
      return res.status(400).json({ success: false, error: 'jid is required' });
    }

    const normJid = normaliseJid(jid);
    await blockSender(userId, normJid, display_name || normJid, userToken);

    res.json({ success: true, data: { jid: normJid, display_name: display_name || normJid } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/privacy/blocked/:jid ─────────────────────────────────────────
// :jid is URL-encoded
router.delete('/blocked/:jid', async (req: Request, res: Response) => {
  try {
    const userId    = req.userId!;
    const userToken = getToken(req);
    const jid       = decodeURIComponent(req.params.jid);

    if (!jid) {
      return res.status(400).json({ success: false, error: 'jid is required' });
    }

    await unblockSender(userId, jid, userToken);
    res.json({ success: true, message: `${jid} removed from block list` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
