/**
 * Activity Logs API Route
 * Provides real-time logs and activity feed
 */

import { Router, Request, Response } from 'express';
import { getRecentLogs, addLogClient, removeLogClient, clearLogs, addLog } from '../services/activity-log';

const router = Router();

// GET /api/logs - Get recent logs
router.get('/', (req: Request, res: Response) => {
  const logs = getRecentLogs();
  res.json({
    success: true,
    data: logs,
    count: logs.length
  });
});

// GET /api/logs/stream - SSE stream for real-time logs
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial data
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Log stream connected' })}\n\n`);

  // Add client
  addLogClient(res);

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (e) {
      clearInterval(heartbeat);
      removeLogClient(res);
    }
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
    removeLogClient(res);
  });
});

// DELETE /api/logs - Clear logs
router.delete('/', (req: Request, res: Response) => {
  clearLogs();
  res.json({
    success: true,
    message: 'Logs cleared'
  });
});

// POST /api/logs - Add a log (for testing)
router.post('/', (req: Request, res: Response) => {
  const { type = 'info', icon = 'ℹ️', title, details } = req.body;
  
  if (!title) {
    return res.status(400).json({
      success: false,
      error: 'title is required'
    });
  }

  const entry = addLog(type, icon, title, details);
  res.json({
    success: true,
    data: entry
  });
});

export default router;
