/**
 * Health Check Route
 */

import { Router } from 'express';
import { supabase } from '../config/supabase';
import { systemState } from '../services/system-state';
import { isMLClassifierReady, getMLClassifierStatus } from '../classifier/ml';

const router = Router();

router.get('/', async (req, res) => {
  const mlStatus = getMLClassifierStatus();
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    systemState: systemState.getState(),
    services: {
      api: 'ok',
      supabase: 'not configured',
      gemini: process.env.GOOGLE_AI_API_KEY ? 'configured' : 'not configured',
      ml_classifier: isMLClassifierReady() ? 'ready' : (mlStatus.error || 'not loaded'),
    },
    ml: isMLClassifierReady() ? {
      accuracy: mlStatus.meta?.categoryAccuracy,
      method: mlStatus.meta?.method,
      categories: mlStatus.meta?.categories,
    } : null,
  };

  // Test Supabase connection if client exists
  if (supabase) {
    try {
      const { error } = await supabase.from('messages').select('id').limit(1);
      health.services.supabase = error ? 'error' : 'ok';
    } catch (err) {
      health.services.supabase = 'error';
    }
  }

  res.json(health);
});

export default router;
