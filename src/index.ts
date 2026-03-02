/**
 * Backend Server Entry Point
 * WhatsApp Task Manager API with Integrated WhatsApp Client
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from backend .env only
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import auth middleware
import { requireAuth, optionalAuth } from './middleware/auth-supabase';

// Import routes
import messagesRouter from './routes/messages-hybrid';
import classifyRouter from './routes/classify';
import statsRouter from './routes/stats-hybrid';
import healthRouter from './routes/health';
import whatsappRouter, { setWhatsAppFunctions } from './routes/whatsapp';
import logsRouter from './routes/logs';
import actionItemsRouter from './routes/action-items-hybrid';
import authRouter from './routes/auth-supabase';
import searchRouter from './routes/search';
import dailySummaryRouter from './routes/daily-summary';
import { systemState } from './services/system-state';

// Import WhatsApp service
import { startWhatsApp, stopWhatsApp, logoutWhatsApp, setSessionOwner, getSessionOwner } from './services/whatsapp-integrated';
import log from './services/activity-log';

// Wire up WhatsApp functions to routes
setWhatsAppFunctions(startWhatsApp, stopWhatsApp, logoutWhatsApp, setSessionOwner, getSessionOwner);

const app = express();
const PORT = process.env.PORT || 3001;
const AUTO_START_WHATSAPP = process.env.AUTO_START_WHATSAPP !== 'false';

// Trust proxy for rate limiting behind reverse proxies (Render, Heroku, etc.)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS - strict allowed origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://whatsappautomation-gamma.vercel.app',
  'https://whatsappautomation.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return callback(null, true);
    }
    // Allow Vercel preview URLs
    if (origin.includes('vercel.app')) {
      return callback(null, true);
    }
    console.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  message: { success: false, error: 'Too many requests, please slow down' }
});
app.use('/api/', limiter);

// Logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// ── Public routes (no auth required) ──
app.use('/api/auth', authRouter);
app.use('/api/health', healthRouter);

// ── Protected routes (requireAuth) ──
app.use('/api/messages', requireAuth, messagesRouter);
app.use('/api/classify', requireAuth, classifyRouter);
app.use('/api/stats', requireAuth, statsRouter);
app.use('/api/whatsapp', requireAuth, whatsappRouter);
app.use('/api/logs', requireAuth, logsRouter);
app.use('/api/actions', requireAuth, actionItemsRouter);
app.use('/api/search', requireAuth, searchRouter);
app.use('/api/daily-summary', requireAuth, dailySummaryRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'WhatsApp Task Manager API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      health: '/api/health',
      messages: '/api/messages',
      classify: '/api/classify',
      stats: '/api/stats',
      logs: '/api/logs',
      whatsapp: '/api/whatsapp',
      actions: '/api/actions',
      search: '/api/search',
      dailySummary: '/api/daily-summary'
    }
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Internal Server Error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, async () => {
  log.success('Server Started', `API running at http://localhost:${PORT}`);
  log.info('Frontend URL', process.env.FRONTEND_URL || 'http://localhost:5173');
  
  console.log('');
  console.log('🚀 WhatsApp Task Manager v2.0 - Supabase Edition');
  console.log('━'.repeat(50));
  console.log(`📡 API Server: http://localhost:${PORT}`);
  console.log(`🔗 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log('━'.repeat(50));
  console.log('');
  console.log('📋 API Endpoints:');
  console.log('  POST /api/auth/*       - Auth (public)');
  console.log('  GET  /api/health       - Health check (public)');
  console.log('  GET  /api/messages     - List messages (auth)');
  console.log('  POST /api/classify     - Classify text (auth)');
  console.log('  GET  /api/stats        - Statistics (auth)');
  console.log('  GET  /api/logs         - Activity logs (auth)');
  console.log('  GET  /api/actions      - Action items (auth)');
  console.log('  GET  /api/whatsapp/*   - WhatsApp control (auth)');
  console.log('  POST /api/search       - AI search (auth)');
  console.log('  GET  /api/daily-summary - Daily summary (auth)');
  console.log('');

  // Auto-start WhatsApp if enabled
  if (AUTO_START_WHATSAPP) {
    log.info('Auto-starting WhatsApp', 'Set AUTO_START_WHATSAPP=false in .env to disable');
    
    setTimeout(() => {
      startWhatsApp().catch(err => {
        log.error('WhatsApp Auto-start Failed', err.message);
      });
    }, 2000);
  } else {
    log.info('WhatsApp Manual Mode', 'POST /api/whatsapp/start to connect');
  }
});

// Graceful shutdown handling
async function gracefulShutdown(signal: string) {
  console.log(`📴 ${signal} received, shutting down gracefully...`);
  try {
    await stopWhatsApp();
  } catch (e) {
    console.error('WhatsApp stop error during shutdown:', e);
  }
  await systemState.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
