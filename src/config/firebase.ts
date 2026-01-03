/**
 * Firebase Admin SDK Configuration
 * Server-side Firebase initialization for backend services
 */

import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// Check for service account file
const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
const hasServiceAccount = fs.existsSync(serviceAccountPath);

// Check for environment variables
const hasEnvCredentials = process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;

console.log('🔥 Firebase Configuration:');
console.log('   - Project ID:', process.env.FIREBASE_PROJECT_ID || 'mindlineforai');
console.log('   - Has service account file:', hasServiceAccount);
console.log('   - Has env credentials:', hasEnvCredentials);
console.log('   - Client email:', process.env.FIREBASE_CLIENT_EMAIL ? '✓ Set' : '✗ Not set');
console.log('   - Private key:', process.env.FIREBASE_PRIVATE_KEY ? `✓ Set (${process.env.FIREBASE_PRIVATE_KEY.length} chars)` : '✗ Not set');

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (hasServiceAccount) {
    // Use service account file if available (local development)
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || 'mindlineforai',
    });
    console.log('✅ Firebase Admin SDK initialized with service account file');
  } else if (hasEnvCredentials) {
    // Use environment variables (production on Render)
    try {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      console.log('   - Private key starts with:', privateKey?.substring(0, 30) + '...');
      console.log('   - Private key ends with:', '...' + privateKey?.substring(privateKey.length - 30));
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || 'mindlineforai',
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
        projectId: process.env.FIREBASE_PROJECT_ID || 'mindlineforai',
      });
      console.log('✅ Firebase Admin SDK initialized with environment variables');
    } catch (error: any) {
      console.error('❌ Firebase initialization error:', error.message);
      // Fallback to no credentials
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'mindlineforai',
      });
      console.log('⚠️ Firebase Admin SDK initialized without credentials (fallback)');
    }
  } else {
    // Fallback: Initialize without credentials (limited functionality)
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'mindlineforai',
    });
    console.log('⚠️ Firebase Admin SDK initialized without credentials');
    console.log('   Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY env vars');
  }
}

// Get Firestore database instance
export const db = admin.firestore();

// Test Firestore connection
async function testFirestoreConnection() {
  try {
    const testDoc = db.collection('_connection_test').doc('test');
    await testDoc.set({ 
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      message: 'Firebase connection test successful'
    });
    console.log('✅ Firestore connection TEST PASSED - Can read/write data!');
    // Clean up test document
    await testDoc.delete();
    return true;
  } catch (error: any) {
    console.error('❌ Firestore connection TEST FAILED:', error.message);
    console.error('   Full error:', error);
    return false;
  }
}

// Run connection test on startup
testFirestoreConnection();

// Get Firebase Auth instance
export const auth = admin.auth();

// Collection names (matching previous schema)
export const COLLECTIONS = {
  USERS: 'users',
  MESSAGES: 'messages',
  ACTION_ITEMS: 'action_items',
  ACTIVITY_LOGS: 'activity_logs',
  RULES: 'rules',
  TASKS: 'tasks',
  FEEDBACK: 'feedback',
  WHATSAPP_SESSIONS: 'whatsapp_sessions',
  SYSTEM: 'system'
} as const;

// Database types (matching previous schema)
export interface FirebaseUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  emailConfirmed: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface FirebaseMessage {
  id: string;
  sender: string;
  chatName: string | null;
  timestamp: admin.firestore.Timestamp;
  content: string;
  messageType: string;
  classification: string | null;
  decision: string | null;
  priority: string | null;
  aiReasoning: string | null;
  notionPageId: string | null;
  metadata: any;
  userId?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface FirebaseActionItem {
  id: string;
  title: string;
  description: string | null;
  originalMessage: string | null;
  sender: string | null;
  chatName: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  category: 'work' | 'study' | 'personal' | 'urgent' | 'other';
  dueDate: admin.firestore.Timestamp | null;
  dueTime: string | null;
  tags: string[];
  aiConfidence: number | null;
  messageId: string | null;
  userId?: string;
  completedAt: admin.firestore.Timestamp | null;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface FirebaseActivityLog {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'message';
  icon: string;
  title: string;
  details: string | null;
  userId?: string;
  timestamp: admin.firestore.Timestamp;
}

export interface FirebaseRule {
  id: string;
  ruleType: string;
  contactName: string | null;
  groupName: string | null;
  keywords: string[] | null;
  priority: string | null;
  category: string | null;
  isActive: boolean;
  userId?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// Helper to convert Firestore Timestamp to ISO string
// Also handles cases where the value is already an ISO string or a Date object
export function timestampToISO(timestamp: admin.firestore.Timestamp | string | Date | null | undefined): string | null {
  if (!timestamp) return null;
  
  // Already an ISO string
  if (typeof timestamp === 'string') {
    return timestamp;
  }
  
  // Regular Date object
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  
  // Firestore Timestamp object (has toDate method)
  if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toISOString();
  }
  
  // Firestore Timestamp-like object with _seconds and _nanoseconds
  if (typeof timestamp === 'object' && '_seconds' in timestamp) {
    const ts = timestamp as unknown as { _seconds: number; _nanoseconds: number };
    const nanoseconds = ts._nanoseconds || 0;
    return new Date(ts._seconds * 1000 + nanoseconds / 1000000).toISOString();
  }
  
  // Fallback - try to create a date from it
  try {
    return new Date(timestamp as any).toISOString();
  } catch {
    console.warn('Unable to convert timestamp:', timestamp);
    return null;
  }
}

// Helper to convert ISO string to Firestore Timestamp  
export function isoToTimestamp(isoString: string | null): admin.firestore.Timestamp | null {
  return isoString ? admin.firestore.Timestamp.fromDate(new Date(isoString)) : null;
}

// Export admin for direct access if needed
export { admin };
