/**
 * Integrated WhatsApp Service using Baileys
 * Pure WebSocket connection - NO Chrome/Puppeteer needed
 * Works on stateless hosting like Render
 * Sessions stored in Firestore for persistence
 */

import makeWASocket, {
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  BufferJSON,
  initAuthCreds,
  AuthenticationCreds,
  SignalDataTypeMap
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import pino from 'pino';
import { db, COLLECTIONS, admin } from '../config/firebase';
import { updateWhatsAppState, getWhatsAppState } from '../routes/whatsapp';
import { hybridMessageStore } from './hybrid-message-store';
import { hybridActionItems } from './hybrid-action-items';
import { classifyWithAI, initGemini } from './ai-classifier';
import log from './activity-log';
import { systemState } from './system-state';

// ============================================
// FIRESTORE AUTH STATE STORAGE WITH LOCAL FALLBACK
// ============================================

import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import * as fs from 'fs';
import * as path from 'path';

// Track whether Firestore is available
let useLocalAuth = false;

/**
 * Custom auth state that stores credentials in Firestore instead of files
 * Falls back to local file storage when Firestore is not available
 * This enables stateless hosting on Render/Railway/Fly.io
 */
async function useFirestoreAuthState(sessionId: string = 'default') {
  const collectionName = COLLECTIONS.WHATSAPP_SESSIONS;
  
  // Check if Firestore is available by doing a quick test
  try {
    await db.collection(collectionName).doc('__test__').get();
  } catch (error) {
    console.log('⚠️ Firestore not available, using local file auth state');
    useLocalAuth = true;
    // Use local file-based auth state as fallback
    const sessionDir = path.join(__dirname, '../../_IGNORE_session', sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const localAuth = await useMultiFileAuthState(sessionDir);
    return {
      ...localAuth,
      clearSession: async () => {
        try {
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            console.log('Local session cleared');
          }
        } catch (error) {
          console.error('Error clearing local session:', error);
        }
      }
    };
  }

  // Helper to create document ID
  const getDocId = (key: string) => `${sessionId}_${key}`.replace(/[\/\\]/g, '_');

  // Helper to read from Firestore
  const readData = async (key: string): Promise<any> => {
    try {
      const docRef = db.collection(collectionName).doc(getDocId(key));
      const doc = await docRef.get();
      
      if (!doc.exists) return null;
      
      const data = doc.data();
      return data?.value ? JSON.parse(data.value, BufferJSON.reviver) : null;
    } catch (error) {
      console.error(`Error reading ${key} from Firestore:`, error);
      return null;
    }
  };

  // Helper to write to Firestore
  const writeData = async (key: string, value: any): Promise<void> => {
    try {
      const docRef = db.collection(collectionName).doc(getDocId(key));
      const serialized = JSON.stringify(value, BufferJSON.replacer);
      
      await docRef.set({
        sessionId,
        key,
        value: serialized,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error(`Error writing ${key} to Firestore:`, error);
    }
  };

  // Helper to delete from Firestore
  const removeData = async (key: string): Promise<void> => {
    try {
      const docRef = db.collection(collectionName).doc(getDocId(key));
      await docRef.delete();
    } catch (error) {
      console.error(`Error deleting ${key} from Firestore:`, error);
    }
  };

  // Load existing creds or initialize new ones
  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[]
        ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          
          await Promise.all(
            ids.map(async (id) => {
              const value = await readData(`${type}-${id}`);
              if (value) {
                data[id] = value;
              }
            })
          );
          
          return data;
        },
        set: async (data: any): Promise<void> => {
          const tasks: Promise<void>[] = [];
          
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              
              if (value) {
                tasks.push(writeData(key, value));
              } else {
                tasks.push(removeData(key));
              }
            }
          }
          
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
    clearSession: async () => {
      // Delete all session documents
      try {
        const snapshot = await db.collection(collectionName)
          .where('sessionId', '==', sessionId)
          .get();
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        console.log(`Cleared ${snapshot.size} session documents`);
      } catch (error) {
        console.error('Error clearing session:', error);
      }
    }
  };
}

// ============================================
// WHATSAPP SERVICE
// ============================================

// Connection state machine to prevent race conditions
type ConnectionPhase = 'idle' | 'starting' | 'qr_ready' | 'authenticating' | 'connected' | 'reconnecting';
let connectionPhase: ConnectionPhase = 'idle';

// Flag for seamless QR regeneration (skip initializing UI during restart-required)
let seamlessQrRegeneration = false;

let whatsappSocket: WASocket | null = null;
let messagesProcessed = 0;
let authState: Awaited<ReturnType<typeof useFirestoreAuthState>> | null = null;
let lastQrTime = 0; // Track when last QR was generated
let qrRetryCount = 0; // Track QR retry attempts
let lastConnectionAttempt = 0; // Prevent rapid reconnection (for auto-reconnects only)
let systemStateInitialized = false; // Track if system state was initialized
let connectionHealthy = false; // Track if connection is stable
let lastSuccessfulConnection = 0; // Track last successful connection time
let reconnectAttempts = 0; // Track consecutive reconnect attempts
let scheduledReconnect: ReturnType<typeof setTimeout> | null = null; // Track scheduled reconnects
let qrExpiryTimeout: ReturnType<typeof setTimeout> | null = null; // Track QR expiry for auto-regeneration

const QR_TIMEOUT_MS = 300000; // QR code valid for 300 seconds (5 minutes)
const MAX_QR_RETRIES = 30; // Maximum QR regenerations before giving up
const MIN_RECONNECT_DELAY = 30000; // Minimum 30 seconds between reconnect attempts (for normal reconnects)
const MIN_QR_RECONNECT_DELAY = 2000; // Minimum 2 seconds for QR-phase reconnects
const MIN_QR_REGENERATION_DELAY = 120000; // Minimum 2 minutes between QR regenerations
const MAX_RECONNECT_ATTEMPTS = 10; // Maximum consecutive reconnect attempts before resetting
const RECONNECT_BACKOFF_BASE = 5000; // Base delay for exponential backoff

// In-memory cache for processed message IDs to prevent duplicates efficiently
const processedMessageIds = new Set<string>();
const MAX_PROCESSED_CACHE = 5000; // Keep last 5000 message IDs in memory

// Manage cache size
function addToProcessedCache(messageKey: string) {
  if (processedMessageIds.size >= MAX_PROCESSED_CACHE) {
    // Remove oldest entries (first 1000)
    const entries = Array.from(processedMessageIds);
    entries.slice(0, 1000).forEach(id => processedMessageIds.delete(id));
  }
  processedMessageIds.add(messageKey);
}

// Calculate reconnect delay with exponential backoff
function getReconnectDelay(): number {
  const baseDelay = RECONNECT_BACKOFF_BASE;
  const maxDelay = 60000; // Max 1 minute
  const delay = Math.min(baseDelay * Math.pow(1.5, reconnectAttempts), maxDelay);
  return delay;
}

// Clear any scheduled reconnect
function clearScheduledReconnect() {
  if (scheduledReconnect) {
    clearTimeout(scheduledReconnect);
    scheduledReconnect = null;
  }
}

// Clear QR expiry timeout
function clearQrExpiryTimeout() {
  if (qrExpiryTimeout) {
    clearTimeout(qrExpiryTimeout);
    qrExpiryTimeout = null;
  }
}

// Cleanup the current socket properly before creating a new one
async function cleanupSocket() {
  if (whatsappSocket) {
    console.log('🧹 Cleaning up existing socket...');
    try {
      // Remove all event listeners first to prevent zombie handlers
      whatsappSocket.ev.removeAllListeners('connection.update');
      whatsappSocket.ev.removeAllListeners('creds.update');
      whatsappSocket.ev.removeAllListeners('messages.upsert');
      // End the socket connection
      whatsappSocket.end(undefined);
    } catch (e) {
      console.log('Socket cleanup error (ignored):', e);
    }
    whatsappSocket = null;
  }
}

// Schedule a reconnect with proper tracking
function scheduleReconnect(delay: number, reason: string) {
  clearScheduledReconnect();
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log(`⚠️ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Resetting state.`);
    reconnectAttempts = 0;
    connectionPhase = 'idle';
    updateWhatsAppState({
      status: 'disconnected',
      progressText: 'Connection failed. Please try again.',
      error: 'Maximum reconnection attempts reached'
    });
    return;
  }
  
  console.log(`⏳ Scheduling reconnect in ${Math.round(delay/1000)}s (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}): ${reason}`);
  connectionPhase = 'reconnecting';
  
  scheduledReconnect = setTimeout(() => {
    scheduledReconnect = null;
    const currentState = getWhatsAppState();
    if (currentState.status !== 'connected') {
      reconnectAttempts++;
      startWhatsApp(false); // Auto-reconnect, not forced
    }
  }, delay);
}

/**
 * Process messages that arrived while the system was offline
 * Fetches message history and processes any unprocessed messages
 */
async function processMissedMessages(offlineSince: Date): Promise<number> {
  if (!whatsappSocket) return 0;
  
  log.info('Processing missed messages', `Checking messages since ${offlineSince.toISOString()}`);
  
  let processedCount = 0;
  
  try {
    // Get all stored message IDs to check for duplicates
    const { data: existingMessages } = await hybridMessageStore.getAll({ limit: 1000 });
    const existingMsgIds = new Set(existingMessages.map(m => m.id));
    
    // Use Baileys to fetch recent messages from all chats
    // Note: Baileys doesn't have a direct "fetch history" method after connection
    // The 'messages.upsert' with type 'append' handles historical messages
    // We'll mark the offline period and let the normal message handler process them
    
    log.info('Missed messages check', 'Historical messages will be processed as they sync');
    
    // Update system state
    await systemState.recordMissedMessagesProcessed(processedCount);
    
    return processedCount;
  } catch (error: any) {
    log.error('Failed to process missed messages', error.message);
    return 0;
  }
}

/**
 * Get the current user's phone number for associating data
 */
function getCurrentUserId(): string {
  const user = whatsappSocket?.user;
  return user?.id?.split(':')[0] || 'unknown';
}

// Store user's own sent message (for context, without classification)
async function storeOwnMessage(msg: proto.IWebMessageInfo, userId: string): Promise<string | null> {
  try {
    const content = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption ||
                    '[Media/No Content]';
    
    const chatName = msg.key.remoteJid || 'Unknown';
    const isGroup = chatName.endsWith('@g.us');

    const messageData = {
      sender: 'Me',
      chat_name: chatName,
      timestamp: new Date((msg.messageTimestamp as number) * 1000).toISOString(),
      content: content,
      message_type: Object.keys(msg.message || {})[0] || 'text',
      classification: 'sent',
      decision: 'none',
      priority: 'none',
      ai_reasoning: 'User sent message',
      metadata: {
        isGroupMsg: isGroup,
        fromMe: true,
        messageKey: msg.key.id
      }
    };

    // Store using hybrid store with userId
    const stored = await hybridMessageStore.add(messageData, userId);
    return stored.id;
  } catch (error: any) {
    log.error('Store own message failed', error.message);
    return null;
  }
}

// Store message with AI classification and create action items
async function storeMessage(msg: proto.IWebMessageInfo): Promise<string | null> {
  const userId = getCurrentUserId();
  
  try {
    const content = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption ||
                    '[Media/No Content]';
    
    const sender = msg.pushName || msg.key.remoteJid || 'Unknown';
    const chatName = msg.key.remoteJid || 'Unknown';
    const isGroup = chatName.endsWith('@g.us');
    
    // Classify with AI
    log.info('Classifying message', `From: ${sender}`);
    const classification = await classifyWithAI(content, sender);

    const messageData = {
      sender: sender,
      chat_name: chatName,
      timestamp: new Date((msg.messageTimestamp as number) * 1000).toISOString(),
      content: content,
      message_type: Object.keys(msg.message || {})[0] || 'text',
      classification: classification.category,
      decision: classification.decision,
      priority: classification.priority,
      ai_reasoning: classification.reasoning,
      metadata: {
        isGroupMsg: isGroup,
        fromMe: msg.key.fromMe,
        suggestedTask: classification.suggestedTask,
        deadline: classification.deadline,
        actionItemsCount: classification.actionItems?.length || 0,
        messageKey: msg.key.id
      }
    };

    // Store using hybrid store with userId for per-user data
    const stored = await hybridMessageStore.add(messageData, userId);
    const messageId = stored.id;
    
    log.success(`Message stored (${hybridMessageStore.getStorageType()})`, 
      `${classification.category.toUpperCase()} | ${classification.priority} | ${classification.decision}`,
      { id: stored.id, sender, classification }
    );

    // Create action items from AI extraction
    if (classification.actionItems && classification.actionItems.length > 0) {
      for (const aiAction of classification.actionItems) {
        const actionItem = await hybridActionItems.add({
          messageId,
          title: aiAction.title,
          description: aiAction.description || content,
          sender,
          chatName,
          priority: aiAction.priority || 'medium',
          category: classification.category === 'work' || classification.category === 'study' || classification.category === 'personal' || classification.category === 'urgent' 
            ? classification.category 
            : 'other',
          dueDate: aiAction.dueDate || null,
          dueTime: aiAction.dueTime || null,
          tags: [aiAction.type],
          originalMessage: content,
          aiConfidence: 0.9,
          status: 'pending',
          completedAt: null
        });
        log.info('AI Action Item Created', actionItem.title);
      }
    } else if (classification.decision === 'create' || classification.decision === 'review') {
      const actionItem = await hybridActionItems.add({
        messageId,
        title: classification.suggestedTask || content.slice(0, 80),
        description: content.length > 80 ? content : null,
        sender,
        chatName,
        priority: classification.priority as 'urgent' | 'high' | 'medium' | 'low' || 'medium',
        category: classification.category === 'work' || classification.category === 'study' || classification.category === 'personal' || classification.category === 'urgent' 
          ? classification.category 
          : 'other',
        dueDate: classification.deadline || null,
        dueTime: null,
        tags: [],
        originalMessage: content,
        aiConfidence: 0.7,
        status: 'pending',
        completedAt: null
      });
      
      if (actionItem) {
        log.info('Action Item Auto-Created', actionItem.title);
      }
    }

    return messageId;
  } catch (error: any) {
    log.error('Store message failed', error.message);
    return null;
  }
}

// Start WhatsApp client using Baileys
// force=true bypasses throttling for user-initiated actions
export async function startWhatsApp(force: boolean = false): Promise<void> {
  const now = Date.now();
  const currentState = getWhatsAppState();
  const isQrPhase = currentState.status === 'qr_ready' || connectionPhase === 'qr_ready';
  
  // Use shorter delay during QR phase for seamless regeneration
  const minDelay = isQrPhase ? MIN_QR_RECONNECT_DELAY : MIN_RECONNECT_DELAY;
  
  // Prevent rapid reconnection attempts (only for auto-reconnects, not user actions)
  if (!force && lastConnectionAttempt && (now - lastConnectionAttempt) < minDelay) {
    console.log(`⏳ Skipping auto-reconnect - too soon since last attempt (min: ${minDelay}ms)`);
    return;
  }
  
  // Check connection phase state machine
  if (connectionPhase === 'starting') {
    if (force) {
      console.log('⚠️ Force start requested, cleaning up current attempt...');
      await cleanupSocket();
    } else {
      log.warning('WhatsApp already starting');
      return;
    }
  }

  if (currentState.status === 'connected' && !force) {
    log.info('WhatsApp already connected');
    return;
  }

  // Clear any pending reconnects/timeouts when user forces connect
  if (force) {
    clearScheduledReconnect();
    clearQrExpiryTimeout();
    qrRetryCount = 0; // Reset QR count on force
    reconnectAttempts = 0; // Reset reconnect attempts on force
    seamlessQrRegeneration = false; // Reset seamless flag on force
  }

  // Clean up existing socket before creating new one
  await cleanupSocket();

  connectionPhase = 'starting';
  lastConnectionAttempt = now;
  
  // Skip the "initializing" UI if we're doing seamless QR regeneration
  if (!seamlessQrRegeneration) {
    updateWhatsAppState({ 
      status: 'initializing', 
      error: null,
      progress: 0,
      progressText: 'Initializing WhatsApp...',
      connectionStartTime: Date.now()
    });
  } else {
    // Keep showing qr_ready status but update progress text
    updateWhatsAppState({
      progressText: 'Reconnecting to WhatsApp servers...'
    });
  }

  // Initialize Gemini AI
  initGemini();

  log.info('Starting WhatsApp Client', 'Using Baileys (WebSocket)...');

  try {
    // Get Firestore auth state
    authState = await useFirestoreAuthState('wa-task-manager');
    
    // Fetch latest Baileys version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    // Only show connecting if not in seamless mode
    if (!seamlessQrRegeneration) {
      updateWhatsAppState({
        status: 'initializing',
        progressText: 'Connecting to WhatsApp...'
      });
    }
    
    // Reset seamless flag after setup is done - next QR will show normally
    seamlessQrRegeneration = false;

    // Create socket connection - NO CHROME/PUPPETEER!
    whatsappSocket = makeWASocket({
      version,
      auth: {
        creds: authState.state.creds,
        keys: makeCacheableSignalKeyStore(authState.state.keys, pino({ level: 'silent' }) as any)
      },
      printQRInTerminal: false, // We handle QR ourselves
      browser: ['WhatsApp Task Manager', 'Chrome', '120.0.0'],
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      logger: pino({ level: 'silent' }) as any,
      // QR code timeout - wait 2 minutes before regenerating
      qrTimeout: QR_TIMEOUT_MS,
      // Connection timeout - 3 minutes
      connectTimeoutMs: 180000,
      // Keep alive to maintain connection
      keepAliveIntervalMs: 30000,
      // Retry on network issues
      retryRequestDelayMs: 1000,
      // Don't auto-refresh QR too quickly
      defaultQueryTimeoutMs: 120000
    });

    // Handle connection updates
    whatsappSocket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code received - generate base64 image
      if (qr) {
        const now = Date.now();
        
        // Don't regenerate QR too quickly - wait at least 55 seconds (but allow first QR)
        if (lastQrTime && (now - lastQrTime) < MIN_QR_REGENERATION_DELAY && qrRetryCount > 0) {
          console.log('⏳ Skipping QR regeneration - too soon');
          return;
        }
        
        // Check if we've exceeded max retries
        if (qrRetryCount >= MAX_QR_RETRIES) {
          console.log('❌ Max QR retries reached');
          connectionPhase = 'idle';
          updateWhatsAppState({
            status: 'error',
            error: 'QR code expired. Please try connecting again.',
            qrCode: null
          });
          return;
        }
        
        qrRetryCount++;
        lastQrTime = now;
        connectionPhase = 'qr_ready';
        
        console.log(`📱 QR Code received from Baileys (attempt ${qrRetryCount}/${MAX_QR_RETRIES})`);
        try {
          // Generate QR code as base64 data URL
          const qrImage = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
          
          updateWhatsAppState({
            status: 'qr_ready',
            qrCode: qrImage,
            progress: 0,
            progressText: `Scan QR code with WhatsApp (${qrRetryCount}/${MAX_QR_RETRIES})`,
            error: null // Clear any previous errors
          });
          
          log.info('QR Code Ready', `Attempt ${qrRetryCount} - Valid for ~60 seconds`);
          
          // Set up QR expiry timeout - auto-regenerate after 65 seconds if not scanned
          clearQrExpiryTimeout();
          qrExpiryTimeout = setTimeout(() => {
            qrExpiryTimeout = null;
            const state = getWhatsAppState();
            // Only regenerate if still showing QR (not connected or authenticating)
            if (state.status === 'qr_ready' && connectionPhase === 'qr_ready') {
              console.log('⏰ QR expiry timeout - triggering regeneration');
              // Clean up and restart to get fresh QR
              cleanupSocket().then(() => {
                if (qrRetryCount < MAX_QR_RETRIES) {
                  connectionPhase = 'idle';
                  startWhatsApp(false);
                } else {
                  connectionPhase = 'idle';
                  updateWhatsAppState({
                    status: 'disconnected',
                    qrCode: null,
                    error: 'QR code expired. Please click Connect to try again.'
                  });
                }
              });
            }
          }, 65000); // 65 seconds - slightly longer than WhatsApp's 60s QR validity
        } catch (err) {
          console.error('QR generation error:', err);
        }
      }

      // Connection state changes
      if (connection === 'connecting') {
        connectionPhase = 'authenticating';
        clearQrExpiryTimeout(); // User is scanning, stop expiry timer
        updateWhatsAppState({
          status: 'connecting',
          progressText: 'Connecting to WhatsApp servers...'
        });
      }

      // Connection established
      if (connection === 'open') {
        const user = whatsappSocket?.user;
        const userName = user?.name || 'Unknown';
        const userPhone = user?.id?.split(':')[0] || user?.id || 'Unknown';
        
        console.log(`✅ WhatsApp connected as: ${userName} (${userPhone})`);
        
        // Reset all tracking vars on successful connection
        connectionPhase = 'connected';
        qrRetryCount = 0;
        lastQrTime = 0;
        connectionHealthy = true;
        lastSuccessfulConnection = Date.now();
        reconnectAttempts = 0; // Reset reconnect attempts on success
        clearScheduledReconnect();
        clearQrExpiryTimeout();
        
        updateWhatsAppState({
          status: 'connected',
          qrCode: null,
          user: {
            name: userName,
            phone: userPhone
          },
          progress: 100,
          progressText: 'Connected!',
          messagesProcessed: 0,
          error: null // Clear any previous errors
        });
        
        log.success('WhatsApp Connected', `${userName} (${userPhone})`);
        
        // Initialize system state tracking and check for missed messages
        if (!systemStateInitialized) {
          systemStateInitialized = true;
          const { wasOffline, offlineSince, offlineDuration } = await systemState.initialize(userPhone);
          
          if (wasOffline && offlineSince) {
            log.info('System was offline', `Checking for messages since ${offlineSince.toISOString()}`);
            // Note: Baileys will automatically sync recent messages on connection
            // They will be processed by the messages.upsert handler
          }
        }
      }

      // Connection closed
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errorMessage = (lastDisconnect?.error as Boom)?.message || 'Unknown error';
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`📱 Connection closed. Status: ${statusCode}, Error: ${errorMessage}, Reconnecting: ${shouldReconnect}`);
        
        if (statusCode === DisconnectReason.loggedOut) {
          // User logged out - clear session completely
          log.warning('WhatsApp Logged Out', 'Session cleared');
          if (authState) {
            await authState.clearSession();
          }
          connectionPhase = 'idle';
          qrRetryCount = 0;
          lastQrTime = 0;
          connectionHealthy = false;
          reconnectAttempts = 0;
          clearScheduledReconnect();
          clearQrExpiryTimeout();
          updateWhatsAppState({
            status: 'disconnected',
            user: null,
            qrCode: null,
            error: 'Logged out from WhatsApp'
          });
        } else if (statusCode === DisconnectReason.restartRequired) {
          // Restart required - VERY common during initial QR phase
          // WhatsApp servers send this as part of normal handshake
          // We need to immediately reconnect to get a fresh QR
          const currentState = getWhatsAppState();
          const timeSinceQr = Date.now() - lastQrTime;
          
          console.log(`⚠️ Restart required. QR status: ${currentState.status}, timeSinceQr: ${timeSinceQr}ms`);
          
          if (currentState.status === 'qr_ready' || connectionPhase === 'qr_ready') {
            // We're in QR phase - the QR is now INVALID because socket died
            // Immediately reconnect to get a fresh QR
            console.log('🔄 Restart required during QR phase - immediately reconnecting for fresh QR');
            log.info('Restart Required', 'Reconnecting immediately for fresh QR...');
            
            // Set seamless flag to avoid showing "initializing" state
            seamlessQrRegeneration = true;
            
            // Keep the UI showing qr_ready but update text
            updateWhatsAppState({
              progressText: 'Refreshing connection...'
            });
            
            // Immediate reconnect - don't wait
            // Don't count this as a reconnect failure
            reconnectAttempts = 0;
            
            // Use setImmediate to allow current event to complete
            setImmediate(() => {
              startWhatsApp(false);
            });
          } else {
            // Not in QR phase - normal restart required (after pairing)
            log.info('Restart Required', 'Reconnecting after pairing...');
            connectionHealthy = false;
            
            updateWhatsAppState({
              status: 'connecting',
              progressText: 'Reconnecting after pairing...'
            });
            
            // Don't count restart as a failure - reset attempts
            reconnectAttempts = 0;
            scheduleReconnect(3000, 'restart required after pairing');
          }
        } else if (statusCode === 428) {
          // Status 428 = QR timeout / Connection Terminated by Server
          // This also happens during QR phase - need to immediately reconnect
          const currentState = getWhatsAppState();
          const now = Date.now();
          const timeSinceLastQr = now - lastQrTime;
          
          console.log(`⚠️ 428 timeout. QR status: ${currentState.status}, timeSinceQr: ${timeSinceLastQr}ms`);
          
          if (currentState.status === 'qr_ready' || connectionPhase === 'qr_ready') {
            // QR phase - immediately reconnect for fresh QR
            console.log('🔄 428 during QR phase - immediately reconnecting for fresh QR');
            log.info('Connection Reset', 'Reconnecting immediately for fresh QR...');
            
            // Set seamless flag
            seamlessQrRegeneration = true;
            
            // Keep UI showing qr_ready
            updateWhatsAppState({
              progressText: `Refreshing QR code... (${qrRetryCount}/${MAX_QR_RETRIES})`
            });
            
            // Immediate reconnect
            reconnectAttempts = 0;
            setImmediate(() => {
              startWhatsApp(false);
            });
          } else {
            // Not in QR phase - normal handling
            log.info('QR Timeout', 'QR code expired, generating new one...');
            connectionHealthy = false;
            
            // Only regenerate if we haven't exceeded max retries
            if (qrRetryCount < MAX_QR_RETRIES) {
              updateWhatsAppState({
                status: 'qr_ready',
                progressText: `QR expired, generating new code... (${qrRetryCount}/${MAX_QR_RETRIES})`
              });
              
              const delay = Math.max(3000, 60000 - timeSinceLastQr);
              console.log(`⏳ Will regenerate QR in ${Math.round(delay/1000)}s`);
              scheduleReconnect(delay, 'QR timeout - generating new QR');
            } else {
              // Max retries reached
              connectionPhase = 'idle';
              updateWhatsAppState({
                status: 'disconnected',
                qrCode: null,
                progressText: 'QR code attempts exhausted',
                error: 'QR code expired too many times. Please click Connect to try again.'
              });
              qrRetryCount = 0;
              reconnectAttempts = 0;
            }
          }
        } else if (statusCode === DisconnectReason.connectionClosed || 
                   statusCode === DisconnectReason.connectionLost) {
          // Connection issues - check if we're in QR phase
          const currentState = getWhatsAppState();
          const now = Date.now();
          const timeSinceLastQr = now - lastQrTime;
          
          // If in QR phase, immediately reconnect for fresh QR
          if (currentState.status === 'qr_ready' || connectionPhase === 'qr_ready') {
            console.log('🔄 Connection closed during QR phase - immediately reconnecting');
            log.info('Connection Reset', 'Reconnecting immediately for fresh QR...');
            
            seamlessQrRegeneration = true;
            updateWhatsAppState({
              progressText: 'Reconnecting...'
            });
            
            reconnectAttempts = 0;
            setImmediate(() => {
              startWhatsApp(false);
            });
          } else if (connectionPhase === 'authenticating') {
            log.info('Authentication in progress', 'Waiting for device confirmation...');
            connectionHealthy = false;
            updateWhatsAppState({
              status: 'authenticating',
              progressText: 'Waiting for confirmation on your phone...'
            });
            // Give more time during authentication
            scheduleReconnect(MIN_RECONNECT_DELAY, 'authentication in progress');
          } else if (shouldReconnect) {
            connectionHealthy = false;
            
            // Check if we were recently connected - use shorter delay
            const wasRecentlyConnected = lastSuccessfulConnection && 
              (Date.now() - lastSuccessfulConnection) < 300000; // Within 5 minutes
            
            if (wasRecentlyConnected) {
              log.info('Reconnecting', 'Connection lost, quick reconnect...');
              updateWhatsAppState({
                status: 'connecting',
                progressText: 'Connection lost, reconnecting...'
              });
              scheduleReconnect(5000, 'connection lost - was recently connected');
            } else {
              log.info('Reconnecting', 'Connection lost, attempting reconnect...');
              updateWhatsAppState({
                status: 'connecting',
                progressText: 'Reconnecting...'
              });
              scheduleReconnect(getReconnectDelay(), 'connection lost');
            }
          }
        } else if (shouldReconnect) {
          // Other reconnectable errors - check if in QR phase
          const currentState = getWhatsAppState();
          const now = Date.now();
          const timeSinceLastQr = now - lastQrTime;
          
          // If in QR phase, immediately reconnect for fresh QR
          if (currentState.status === 'qr_ready' || connectionPhase === 'qr_ready') {
            console.log(`🔄 Error during QR phase (${errorMessage}) - immediately reconnecting`);
            log.info('Connection Issue', 'Reconnecting immediately for fresh QR...');
            
            seamlessQrRegeneration = true;
            updateWhatsAppState({
              progressText: 'Reconnecting...'
            });
            
            reconnectAttempts = 0;
            setImmediate(() => {
              startWhatsApp(false);
            });
          } else {
            // Not in QR phase - do normal reconnect
            log.info('Reconnecting', `Error: ${errorMessage}`);
            connectionHealthy = false;
            
            updateWhatsAppState({
              status: 'connecting',
              progressText: `Reconnecting... (${errorMessage})`
            });
            
            scheduleReconnect(getReconnectDelay(), `error: ${errorMessage}`);
          }
        } else {
          // Unrecoverable error - reset everything
          connectionPhase = 'idle';
          qrRetryCount = 0;
          lastQrTime = 0;
          connectionHealthy = false;
          reconnectAttempts = 0;
          clearScheduledReconnect();
          clearQrExpiryTimeout();
          updateWhatsAppState({
            status: 'disconnected',
            user: null,
            qrCode: null,
            error: errorMessage || 'Connection failed'
          });
        }
      }
    });

    // Save credentials when updated
    whatsappSocket.ev.on('creds.update', async () => {
      if (authState) {
        await authState.saveCreds();
      }
    });

    // Listen for incoming messages (both new and historical sync)
    whatsappSocket.ev.on('messages.upsert', async ({ messages, type }) => {
      // Handle both 'notify' (new messages) and 'append' (historical sync)
      if (type !== 'notify' && type !== 'append') return;

      const currentUser = whatsappSocket?.user;
      const userPhone = currentUser?.id?.split(':')[0] || 'unknown';
      
      for (const msg of messages) {
        // Skip own messages (but store them for context)
        const isFromMe = msg.key.fromMe;
        
        // Skip status updates
        if (msg.key.remoteJid === 'status@broadcast') continue;

        const content = msg.message?.conversation || 
                        msg.message?.extendedTextMessage?.text || 
                        '[Media]';
        const sender = isFromMe ? (currentUser?.name || 'Me') : (msg.pushName || msg.key.remoteJid || 'Unknown');
        
        // Get unique message key for deduplication
        const messageKey = msg.key.id;
        if (!messageKey) continue;

        // Fast in-memory duplicate check first
        if (processedMessageIds.has(messageKey)) {
          console.log(`⏭️ Skipping duplicate (cache): ${messageKey}`);
          continue;
        }

        // Then check database for messages not in cache (on wake/restart)
        if (!processedMessageIds.has(messageKey)) {
          const allMessages = await hybridMessageStore.getAll({ limit: 200 });
          const isDuplicate = allMessages.data.some(m => m.metadata?.messageKey === messageKey);
          
          if (isDuplicate) {
            console.log(`⏭️ Skipping duplicate (DB): ${messageKey}`);
            addToProcessedCache(messageKey); // Add to cache for next time
            continue;
          }
        }
        
        // Mark as processed immediately to prevent race conditions
        addToProcessedCache(messageKey);

        // Get message timestamp
        const msgTimestamp = msg.messageTimestamp 
          ? new Date((msg.messageTimestamp as number) * 1000)
          : new Date();

        messagesProcessed++;
        updateWhatsAppState({ messagesProcessed });

        // Log the incoming message
        log.message(sender, content.substring(0, 100));

        // Store and classify with AI (skip classification for own messages)
        if (!isFromMe) {
          await storeMessage(msg);
        } else {
          // Store own messages without classification for context
          await storeOwnMessage(msg, userPhone);
        }
      }
    });

    log.info('WhatsApp Service Started', 'Waiting for connection...');

  } catch (error: any) {
    console.error('❌ WhatsApp error:', error);
    log.error('WhatsApp Error', error.message);
    connectionPhase = 'idle';
    updateWhatsAppState({
      status: 'error',
      error: error.message
    });
  }
}

// Stop WhatsApp
export async function stopWhatsApp(): Promise<void> {
  // Clear any scheduled reconnects/timeouts first
  clearScheduledReconnect();
  clearQrExpiryTimeout();
  
  // Use proper cleanup
  await cleanupSocket();
  
  // Reset all state
  connectionPhase = 'idle';
  connectionHealthy = false;
  reconnectAttempts = 0;
  qrRetryCount = 0;
  lastQrTime = 0;
  
  updateWhatsAppState({
    status: 'disconnected',
    qrCode: null,
    user: null,
    error: null
  });
  
  log.info('WhatsApp Disconnected');
}

// Logout and clear session
export async function logoutWhatsApp(): Promise<void> {
  // Clear any scheduled reconnects/timeouts first
  clearScheduledReconnect();
  clearQrExpiryTimeout();
  
  if (whatsappSocket) {
    try {
      await whatsappSocket.logout();
    } catch (e) {
      // Ignore
    }
    // Clean up listeners
    try {
      whatsappSocket.ev.removeAllListeners('connection.update');
      whatsappSocket.ev.removeAllListeners('creds.update');
      whatsappSocket.ev.removeAllListeners('messages.upsert');
    } catch (e) {
      // Ignore
    }
    whatsappSocket = null;
  }
  
  // Clear Firestore session
  if (authState) {
    await authState.clearSession();
  }
  
  // Reset all state
  connectionPhase = 'idle';
  connectionHealthy = false;
  reconnectAttempts = 0;
  qrRetryCount = 0;
  lastQrTime = 0;
  lastSuccessfulConnection = 0;
  
  updateWhatsAppState({
    status: 'disconnected',
    qrCode: null,
    user: null,
    error: null
  });
  
  log.info('WhatsApp Logged Out', 'Session cleared');
}

// Check if connected
export function isWhatsAppConnected(): boolean {
  return getWhatsAppState().status === 'connected';
}

// Get socket (for sending messages etc)
export function getWhatsAppSocket(): WASocket | null {
  return whatsappSocket;
}
