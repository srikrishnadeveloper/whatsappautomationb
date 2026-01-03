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
// FIRESTORE AUTH STATE STORAGE
// ============================================

/**
 * Custom auth state that stores credentials in Firestore instead of files
 * This enables stateless hosting on Render/Railway/Fly.io
 */
async function useFirestoreAuthState(sessionId: string = 'default') {
  const collectionName = COLLECTIONS.WHATSAPP_SESSIONS;

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

let whatsappSocket: WASocket | null = null;
let isStarting = false;
let messagesProcessed = 0;
let authState: Awaited<ReturnType<typeof useFirestoreAuthState>> | null = null;
let lastQrTime = 0; // Track when last QR was generated
let qrRetryCount = 0; // Track QR retry attempts
let isAuthenticating = false; // Track if user is in authentication process
let lastConnectionAttempt = 0; // Prevent rapid reconnection
let systemStateInitialized = false; // Track if system state was initialized
const QR_TIMEOUT_MS = 120000; // QR code valid for 120 seconds (2 minutes)
const MAX_QR_RETRIES = 15; // Maximum QR regenerations before giving up
const MIN_RECONNECT_DELAY = 10000; // Minimum 10 seconds between reconnect attempts
const MIN_QR_REGENERATION_DELAY = 55000; // Minimum 55 seconds between QR regenerations

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
export async function startWhatsApp(): Promise<void> {
  const now = Date.now();
  
  // Prevent rapid reconnection attempts
  if (lastConnectionAttempt && (now - lastConnectionAttempt) < MIN_RECONNECT_DELAY) {
    console.log('⏳ Skipping connection attempt - too soon since last attempt');
    return;
  }
  
  if (isStarting) {
    log.warning('WhatsApp already starting');
    return;
  }

  const currentState = getWhatsAppState();
  if (currentState.status === 'connected') {
    log.info('WhatsApp already connected');
    return;
  }

  isStarting = true;
  lastConnectionAttempt = now;
  
  updateWhatsAppState({ 
    status: 'initializing', 
    error: null,
    progress: 0,
    progressText: 'Initializing WhatsApp...',
    connectionStartTime: Date.now()
  });

  // Initialize Gemini AI
  initGemini();

  log.info('Starting WhatsApp Client', 'Using Baileys (WebSocket)...');

  try {
    // Get Firestore auth state
    authState = await useFirestoreAuthState('wa-task-manager');
    
    // Fetch latest Baileys version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    updateWhatsAppState({
      status: 'initializing',
      progressText: 'Connecting to WhatsApp...'
    });

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

    // DON'T reset QR state on reconnect - keep the retry count
    // qrRetryCount = 0;  // REMOVED - keep count across reconnects
    isAuthenticating = false;

    // Handle connection updates
    whatsappSocket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code received - generate base64 image
      if (qr) {
        const now = Date.now();
        
        // Don't regenerate QR too quickly - wait at least 55 seconds
        if (lastQrTime && (now - lastQrTime) < MIN_QR_REGENERATION_DELAY) {
          console.log('⏳ Skipping QR regeneration - too soon');
          return;
        }
        
        // Check if we've exceeded max retries
        if (qrRetryCount >= MAX_QR_RETRIES) {
          console.log('❌ Max QR retries reached');
          updateWhatsAppState({
            status: 'error',
            error: 'QR code expired. Please try connecting again.',
            qrCode: null
          });
          isStarting = false;
          return;
        }
        
        qrRetryCount++;
        lastQrTime = now;
        
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
            progressText: `Scan QR code with WhatsApp (${qrRetryCount}/${MAX_QR_RETRIES})`
          });
          
          log.info('QR Code Ready', `Attempt ${qrRetryCount} - Valid for ~60 seconds`);
        } catch (err) {
          console.error('QR generation error:', err);
        }
      }

      // Connection state changes
      if (connection === 'connecting') {
        isAuthenticating = true;
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
        qrRetryCount = 0;
        lastQrTime = 0;
        isAuthenticating = false;
        
        updateWhatsAppState({
          status: 'connected',
          qrCode: null,
          user: {
            name: userName,
            phone: userPhone
          },
          progress: 100,
          progressText: 'Connected!',
          messagesProcessed: 0
        });
        
        log.success('WhatsApp Connected', `${userName} (${userPhone})`);
        isStarting = false;
        
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
          // User logged out - clear session
          log.warning('WhatsApp Logged Out', 'Session cleared');
          if (authState) {
            await authState.clearSession();
          }
          qrRetryCount = 0;
          lastQrTime = 0;
          isAuthenticating = false;
          updateWhatsAppState({
            status: 'disconnected',
            user: null,
            qrCode: null,
            error: 'Logged out from WhatsApp'
          });
        } else if (statusCode === DisconnectReason.restartRequired) {
          // Restart required - common after pairing
          log.info('Restart Required', 'Reconnecting after pairing...');
          isStarting = false;
          // Quick reconnect for restart required - but not too quick
          const now = Date.now();
          const timeSinceLastAttempt = now - lastConnectionAttempt;
          const delay = Math.max(2000, MIN_RECONNECT_DELAY - timeSinceLastAttempt);
          setTimeout(() => startWhatsApp(), delay);
        } else if (statusCode === 428) {
          // Status 428 = QR timeout / Connection Terminated by Server
          // This is normal when QR isn't scanned - just show the current QR, don't restart
          log.info('QR Timeout', 'Waiting for user to scan QR code...');
          const currentState = getWhatsAppState();
          if (currentState.qrCode) {
            // Keep showing the current QR
            updateWhatsAppState({
              status: 'qr_ready',
              progressText: 'Scan the QR code with WhatsApp on your phone'
            });
          }
          // Don't reconnect immediately - wait for the QR regeneration timer
          isStarting = false;
          // Only reconnect if we haven't exceeded max retries
          if (qrRetryCount < MAX_QR_RETRIES) {
            const now = Date.now();
            const timeSinceLastQr = now - lastQrTime;
            // Wait until 60 seconds have passed since last QR
            const delay = Math.max(5000, MIN_QR_REGENERATION_DELAY - timeSinceLastQr);
            console.log(`⏳ Will regenerate QR in ${Math.round(delay/1000)}s`);
            setTimeout(() => {
              if (getWhatsAppState().status !== 'connected') {
                startWhatsApp();
              }
            }, delay);
          }
        } else if (statusCode === DisconnectReason.connectionClosed || 
                   statusCode === DisconnectReason.connectionLost) {
          // Connection issues - try to reconnect with delay
          const now = Date.now();
          if (isAuthenticating) {
            log.info('Authentication in progress', 'Waiting for device confirmation...');
            updateWhatsAppState({
              status: 'authenticating',
              progressText: 'Waiting for confirmation on your phone...'
            });
            // Give more time during authentication - don't spam reconnects
            setTimeout(() => {
              if (isAuthenticating && getWhatsAppState().status !== 'connected') {
                isStarting = false;
                startWhatsApp();
              }
            }, MIN_RECONNECT_DELAY);
          } else if (shouldReconnect) {
            log.info('Reconnecting', 'Connection lost, attempting reconnect...');
            updateWhatsAppState({
              status: 'connecting',
              progressText: 'Reconnecting...'
            });
            isStarting = false;
            const timeSinceLastAttempt = now - lastConnectionAttempt;
            const delay = Math.max(3000, MIN_RECONNECT_DELAY - timeSinceLastAttempt);
            setTimeout(() => startWhatsApp(), delay);
          }
        } else if (shouldReconnect) {
          // Other reconnectable errors - with rate limiting
          log.info('Reconnecting', `Error: ${errorMessage}`);
          updateWhatsAppState({
            status: 'connecting',
            progressText: 'Reconnecting...'
          });
          
          isStarting = false;
          const now = Date.now();
          const timeSinceLastAttempt = now - lastConnectionAttempt;
          const delay = Math.max(5000, MIN_RECONNECT_DELAY - timeSinceLastAttempt);
          setTimeout(() => startWhatsApp(), delay);
        } else {
          qrRetryCount = 0;
          lastQrTime = 0;
          isAuthenticating = false;
          updateWhatsAppState({
            status: 'disconnected',
            user: null,
            qrCode: null
          });
        }
        
        isStarting = false;
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
    updateWhatsAppState({
      status: 'error',
      error: error.message
    });
    isStarting = false;
  }
}

// Stop WhatsApp
export async function stopWhatsApp(): Promise<void> {
  if (whatsappSocket) {
    try {
      whatsappSocket.end(undefined);
    } catch (e) {
      // Ignore
    }
    whatsappSocket = null;
  }
  
  updateWhatsAppState({
    status: 'disconnected',
    qrCode: null,
    user: null
  });
  
  log.info('WhatsApp Disconnected');
}

// Logout and clear session
export async function logoutWhatsApp(): Promise<void> {
  if (whatsappSocket) {
    try {
      await whatsappSocket.logout();
    } catch (e) {
      // Ignore
    }
    whatsappSocket = null;
  }
  
  // Clear Firestore session
  if (authState) {
    await authState.clearSession();
  }
  
  updateWhatsAppState({
    status: 'disconnected',
    qrCode: null,
    user: null
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
