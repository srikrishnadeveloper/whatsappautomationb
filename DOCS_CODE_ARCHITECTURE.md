# Code Architecture & Technical Structure
**WhatsApp Task Manager - Developer Documentation**

---

## 📁 Project Structure

```
WhatsApp-Task-Manager/
├── backend/                    # Node.js Express API
│   ├── src/
│   │   ├── classifier/         # AI & rule-based classification
│   │   ├── config/             # Database & service configs
│   │   ├── middleware/         # Express middleware
│   │   ├── routes/             # API endpoints
│   │   ├── services/           # Business logic
│   │   └── index.ts            # Server entry point
│   ├── database/               # SQL schemas & migrations
│   ├── .env                    # Environment variables
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                   # React Vite app
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── pages/          # Route pages
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── services/       # API client
│   │   │   ├── context/        # React context
│   │   │   ├── config/         # Firebase config
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│
└── [documentation files]
```

---

## 🔧 Backend Architecture

### Entry Point: `index.ts`

**Purpose:** Express server setup and configuration

**Key responsibilities:**
1. Load environment variables
2. Initialize Express app
3. Configure middleware (CORS, Helmet, compression, rate limiting)
4. Mount API routes
5. Start server
6. Handle graceful shutdown

**Code flow:**
```typescript
dotenv.config() 
  → Import routes
  → Setup middleware
  → Mount routes (/api/*)
  → Start server (PORT 3001)
  → Auto-start WhatsApp (if enabled)
```

**Middleware order:**
1. Trust proxy (for rate limiting)
2. Helmet (security headers)
3. CORS (cross-origin requests)
4. Rate limiter (1000 req/min)
5. Morgan (logging)
6. Body parser (JSON, URL-encoded)
7. Compression (gzip)
8. Routes
9. Error handler
10. 404 handler

---

### Classifier System

#### File: `classifier/ai-classifier.ts`

**Purpose:** Gemini AI integration for message classification

**Key functions:**

```typescript
async function getModel()
```
- Tries models in order (gemini-2.0-flash → 2.5-flash → 1.5-flash, etc.)
- Returns first available model
- Caches active model

```typescript
async function classifyMessageWithAI(
  messageContent: string,
  senderName?: string,
  chatName?: string
): Promise<AIClassificationResult>
```
- Main classification function
- Skips AI for very short messages or obvious spam
- Builds context-aware prompt
- Calls Gemini API
- Parses JSON response
- Falls back to rule-based on error

```typescript
function detectSenderImportance(
  senderName?: string,
  chatName?: string
): { isImportant: boolean; context: string }
```
- Checks if sender/chat indicates high priority
- Looks for keywords: work, college, client, boss, etc.
- Returns context (work/professional, education, client/business)

```typescript
function buildClassificationPrompt(
  message: string,
  senderName?: string,
  chatName?: string
): string
```
- Creates structured prompt for AI
- Includes message, sender, chat context
- Adds importance warnings if work/college related
- Specifies JSON output format

**Response format from AI:**
```json
{
  "category": "work|study|personal|ignore",
  "priority": "urgent|high|medium|low",
  "decision": "create|review|ignore",
  "reasoning": "explanation text",
  "confidence": 0.85,
  "action_items": [...]
}
```

---

#### File: `classifier/rule-based.ts`

**Purpose:** Keyword-based fallback classification

**Key functions:**

```typescript
export function classifyMessage(
  content: string
): ClassificationResult
```
- Converts to lowercase
- Matches keywords from WORK_KEYWORDS, STUDY_KEYWORDS, etc.
- Counts matches per category
- Assigns category with most matches
- Calculates confidence based on match count

**Logic flow:**
```
1. Check ignore keywords (greetings, spam)
   → If matches and no work/study keywords → categorize as 'ignore'

2. Count work keywords
3. Count study keywords
4. Compare counts → assign dominant category

5. Check urgency keywords
   → If found → priority = 'urgent'

6. Check deadline keywords + action verbs
   → Increases confidence
```

```typescript
export function makeDecision(
  classification: ClassificationResult,
  messageLength: number
): 'create' | 'ignore' | 'review'
```
- Short messages (< 10 chars) → 'ignore'
- Ignore category + high confidence → 'ignore'
- Work/study + action verb/deadline → 'create'
- Urgent priority → 'create'
- Low confidence → 'review'
- Default → based on category

---

#### File: `classifier/keywords.ts`

**Purpose:** Keyword arrays for classification

**Exports:**
```typescript
export const WORK_KEYWORDS: string[]
export const STUDY_KEYWORDS: string[]
export const IGNORE_KEYWORDS: string[]
export const URGENCY_KEYWORDS: string[]
export const DEADLINE_KEYWORDS: string[]
export const ACTION_VERBS: string[]

export interface ClassificationResult {
  category: 'work' | 'study' | 'personal' | 'ignore';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  confidence: number;
  keywords_matched: string[];
  has_deadline: boolean;
  has_action_verb: boolean;
  decision: 'create' | 'ignore' | 'review';
}
```

---

#### File: `classifier/deadline-parser.ts`

**Purpose:** Extract deadlines from natural language

**Key function:**
```typescript
export function parseDeadline(
  text: string
): { date: Date | null; confidence: number }
```

**Patterns recognized:**
- "tomorrow" → next day
- "next week" → 7 days from now
- "EOD", "end of day" → today 23:59
- "Friday" → next Friday
- "in 3 days" → 3 days from now
- "January 15" → specific date

---

### Services Layer

#### File: `services/whatsapp-integrated.ts`

**Purpose:** WhatsApp client using Baileys library

**Key exports:**
```typescript
export async function startWhatsApp(): Promise<void>
export async function stopWhatsApp(): Promise<void>
export async function logoutWhatsApp(): Promise<void>
export function getWhatsAppState(): WhatsAppState
```

**WhatsAppState interface:**
```typescript
interface WhatsAppState {
  isConnected: boolean;
  phoneNumber: string | null;
  qrCode: string | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
  connectionTime: Date | null;
  lastMessageTime: Date | null;
  messageCount: number;
}
```

**Event emitter:**
- Extends EventEmitter
- Emits: 'qr', 'connected', 'disconnected', 'message', 'error'

**Connection flow:**
```
startWhatsApp()
  → Load saved session or create new
  → Initialize Baileys socket
  → Register event handlers:
      - connection.update → handle QR, connection state
      - messages.upsert → handle new messages
      - creds.update → save session
  → On QR → generate QR code image
  → On connected → update state, fetch user info
  → On message → classify and store
```

**Message handler:**
```typescript
async function handleNewMessage(message: WAMessage)
```
1. Extract: sender, content, chat name
2. Skip: status broadcasts, self messages
3. Classify: using ai-classifier service
4. Store: using hybrid-message-store
5. Extract action items (if decision = 'create')
6. Emit event for SSE stream

---

#### File: `services/hybrid-message-store.ts`

**Purpose:** Unified storage interface with fallback

**Pattern:**
```typescript
class HybridMessageStore {
  async create(message: Message): Promise<{ success: boolean; data?: any }> {
    try {
      // Try Firebase first
      return await firestoreMessageStore.create(message);
    } catch (error) {
      // Fallback to in-memory
      return await messageStore.create(message);
    }
  }
  
  // Same pattern for getAll, getById, update, delete
}

export const hybridMessageStore = new HybridMessageStore();
```

**Why this pattern:**
- Works with or without database
- Graceful degradation
- Easy local development
- Production-ready with proper DB

---

#### File: `services/message-store.ts`

**Purpose:** In-memory storage implementation

**Structure:**
```typescript
class MessageStore {
  private messages: Message[] = [];
  private nextId: number = 1;
  
  async create(message: Message): Promise<...>;
  async getAll(filters?: Filters): Promise<...>;
  async getById(id: string): Promise<...>;
  async update(id: string, updates: Partial<Message>): Promise<...>;
  async delete(id: string): Promise<...>;
  async getStats(userId?: string): Promise<...>;
}

export const messageStore = new MessageStore();
```

**Filtering:**
- Category
- Priority
- Decision
- User ID
- Limit

**Stats calculation:**
- Count by category
- Count by priority
- Count by decision
- Create ratio
- Recent messages

---

#### File: `services/firestore-message-store.ts`

**Purpose:** Firebase Firestore implementation

**Collection:** `messages`

**CRUD operations:**
```typescript
async create(message: Message) {
  const docRef = await db.collection('messages').add({
    ...message,
    created_at: FieldValue.serverTimestamp()
  });
  return docRef.id;
}

async getAll(filters: Filters) {
  let query = db.collection('messages');
  
  if (filters.userId) {
    query = query.where('user_id', '==', filters.userId);
  }
  if (filters.category) {
    query = query.where('classification', '==', filters.category);
  }
  
  query = query.orderBy('timestamp', 'desc');
  
  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
```

---

#### File: `services/hybrid-action-items.ts`

**Purpose:** Action items with hybrid storage

**Same pattern as hybrid-message-store**

**Additional methods:**
```typescript
async createFromMessage(
  messageId: string,
  actionItems: ExtractedActionItem[]
): Promise<...>
```
- Creates multiple action items from one message
- Links to source message
- Auto-assigns IDs

---

#### File: `services/action-items.ts`

**Purpose:** In-memory action items implementation

**Structure:**
```typescript
class ActionItemsService extends EventEmitter {
  private items: ActionItem[] = [];
  
  async create(item: ActionItem): Promise<...>;
  async getAll(filters?: Filters): Promise<...>;
  async getById(id: string): Promise<...>;
  async update(id: string, updates: Partial<ActionItem>): Promise<...>;
  async delete(id: string): Promise<...>;
  async getStats(userId?: string): Promise<...>;
  
  // Event emitter for SSE
  on(event: 'created' | 'updated' | 'deleted', handler: Function);
}
```

**Events:**
- 'created' → when new action item added
- 'updated' → when item edited
- 'deleted' → when item removed

Used by `/api/actions/stream` for real-time updates

---

#### File: `services/ai-classifier.ts`

**Purpose:** Service-level AI classification (alternative to classifier/)

**Note:** There are TWO ai-classifier files:
1. `classifier/ai-classifier.ts` - Used by WhatsApp message handler
2. `services/ai-classifier.ts` - Alternative implementation

**Both provide similar functionality, services/ version more service-oriented**

---

#### File: `services/ai-search.ts`

**Purpose:** AI-powered semantic search

**Key functions:**

```typescript
export async function aiSearch(
  query: string,
  messages: Message[],
  userId?: string
): Promise<AISearchResponse>
```
**Process:**
1. Build context from messages
2. Create prompt: "User query: ... | Messages: ..."
3. Call Gemini to generate answer
4. Extract relevant messages
5. Calculate relevance scores
6. Return answer + relevant messages

```typescript
export async function getConversationSummary(
  personName: string,
  messages: Message[]
): Promise<string>
```
**Process:**
1. Filter messages from/mentioning person
2. Create summary prompt
3. Call Gemini to generate narrative summary
4. Return summary text

---

#### File: `services/activity-log.ts`

**Purpose:** Centralized logging system

**EventEmitter for SSE streaming**

**Methods:**
```typescript
log.info(title: string, message?: string)
log.success(title: string, message?: string)
log.warning(title: string, message?: string)
log.error(title: string, message?: string)
```

**Console output:**
- Color-coded (green/yellow/red/blue)
- Timestamped
- Formatted

**SSE stream:**
- Emits 'log' event with log entry
- Frontend subscribes to `/api/logs/stream`
- Updates activity log in real-time

---

#### File: `services/system-state.ts`

**Purpose:** Track application state

**Tracks:**
- Server start time
- Total requests
- Active connections
- Database status
- WhatsApp status

**Method:**
```typescript
async shutdown(): Promise<void>
```
- Gracefully closes WhatsApp connection
- Closes database connections
- Logs shutdown

**Used by:** SIGTERM/SIGINT handlers in index.ts

---

### Routes Layer

#### File: `routes/whatsapp.ts`

**Purpose:** WhatsApp control endpoints

**Endpoints:**

```typescript
GET /api/whatsapp/status
```
- Returns: current WhatsApp state
- No auth required

```typescript
POST /api/whatsapp/start
```
- Starts WhatsApp connection
- Returns: success message
- No auth required (should add auth in production)

```typescript
POST /api/whatsapp/stop
```
- Stops WhatsApp connection
- Doesn't clear session

```typescript
POST /api/whatsapp/logout
```
- Stops connection AND clears session
- Requires QR scan on next start

```typescript
GET /api/whatsapp/qr
```
- Returns QR code as text string
- For terminal/API display

```typescript
GET /api/whatsapp/qr-image
```
- Returns QR code as Base64 PNG
- For browser display

```typescript
GET /api/whatsapp/events
```
- Server-Sent Events stream
- Streams connection status updates
- Headers: 'Content-Type': 'text/event-stream'

**Implementation details:**
```typescript
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  // Send initial state
  sendEvent({ type: 'status', data: getWhatsAppState() });
  
  // Listen for updates
  const onUpdate = () => sendEvent({ type: 'status', data: getWhatsAppState() });
  whatsappService.on('statusUpdate', onUpdate);
  
  // Cleanup on close
  req.on('close', () => {
    whatsappService.off('statusUpdate', onUpdate);
  });
});
```

---

#### File: `routes/messages-hybrid.ts`

**Purpose:** Message CRUD with hybrid storage

**Endpoints:**

```typescript
GET /api/messages
```
- Query params: category, priority, decision, limit, userId
- Returns: array of messages
- Uses hybrid-message-store.getAll()

```typescript
GET /api/messages/stats
```
- Returns: message statistics
- Breakdown by category, priority, decision

```typescript
GET /api/messages/:id
```
- Returns: single message by ID

```typescript
PATCH /api/messages/:id
```
- Updates: classification, decision, priority, ai_reasoning
- Body: { field: value }
- Validation: only allowed fields

```typescript
DELETE /api/messages/:id
```
- Deletes message
- Also deletes linked action items

---

#### File: `routes/action-items-hybrid.ts`

**Purpose:** Action item CRUD

**Endpoints:**

```typescript
GET /api/actions/stream
```
- Server-Sent Events for action items
- Streams: created, updated, deleted events

```typescript
GET /api/actions
```
- Query params: priority, status, limit, userId
- Returns: array of action items

```typescript
GET /api/actions/stats
```
- Returns: action item statistics

```typescript
GET /api/actions/:id
```
- Returns: single action item

```typescript
POST /api/actions
```
- Creates new action item
- Body: { title, description, priority, dueDate, ... }

```typescript
PATCH /api/actions/:id
```
- Updates action item
- Body: { field: value }

```typescript
DELETE /api/actions/:id
```
- Deletes action item

---

#### File: `routes/stats-hybrid.ts`

**Purpose:** Statistics aggregation

**Endpoints:**

```typescript
GET /api/stats
```
- Returns overall statistics:
  - Total messages
  - By category
  - By priority
  - By decision
  - Create ratio

```typescript
GET /api/stats/timeline
```
- Query params: days (default 7)
- Returns: message counts by date
- Format: [{ date: '2026-02-21', count: 15 }, ...]

```typescript
GET /api/stats/top-senders
```
- Query params: limit (default 10)
- Returns: top message senders
- Format: [{ sender: 'Alice', count: 42 }, ...]

```typescript
GET /api/stats/summary
```
- Returns: quick dashboard summary
- Includes: totals, today's activity, pending items

---

#### File: `routes/classify.ts`

**Purpose:** Manual classification API

**Endpoints:**

```typescript
POST /api/classify
```
- Body: { content: string, sender?: string, chat_name?: string }
- Returns: classification result
- Uses rule-based classifier (ai-classifier.ts in routes)

```typescript
POST /api/classify/batch
```
- Body: { messages: Array<{ content: string }> }
- Returns: array of classification results
- Batch processes multiple messages

**Use case:** Test classification without WhatsApp, classify arbitrary text

---

#### File: `routes/search.ts`

**Purpose:** AI search endpoints

**Endpoints:**

```typescript
POST /api/search
```
- Body: { query: string, userId?: string }
- Returns: AI-generated answer + relevant messages
- Uses ai-search.aiSearch()

```typescript
GET /api/search/person/:name
```
- Param: name (person to search)
- Query: userId
- Returns: conversation summary + all messages from person
- Uses ai-search.getConversationSummary()

---

#### File: `routes/auth-firebase.ts`

**Purpose:** Firebase authentication routes

**Endpoints:**

```typescript
POST /api/auth/register
```
- Body: { email, password, fullName }
- Creates Firebase user + Firestore profile
- Returns: user data + token

```typescript
POST /api/auth/login
```
- Body: { email, password }
- Validates credentials with Firebase
- Returns: user data + token

```typescript
POST /api/auth/logout
```
- Clears server-side session (if any)
- Returns: success message
- Frontend handles token removal

```typescript
GET /api/auth/user
```
- Requires auth (requireAuth middleware)
- Returns: current user profile

```typescript
PATCH /api/auth/user
```
- Requires auth
- Body: { fullName, phone }
- Updates user profile

---

#### File: `routes/health.ts`

**Purpose:** Health check endpoint

```typescript
GET /api/health
```
- Returns:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-02-21T...",
    "uptime": 3600,
    "database": "connected|disconnected",
    "whatsapp": "connected|disconnected"
  }
  ```

---

#### File: `routes/logs.ts`

**Purpose:** Activity log endpoints

**Endpoints:**

```typescript
GET /api/logs
```
- Query: limit (default 100)
- Returns: recent log entries

```typescript
GET /api/logs/stream
```
- Server-Sent Events stream
- Streams new log entries as they occur

---

#### File: `routes/daily-summary.ts`

**Status:** ⚠️ Not mounted in index.ts

**Endpoints (if mounted):**

```typescript
GET /api/daily-summary
```
- Query: date (optional, defaults to today)
- Returns: narrative summary of day's messages

```typescript
GET /api/daily-summary/week
```
- Returns: summaries for past 7 days

---

### Middleware

#### File: `middleware/auth-firebase.ts`

**Purpose:** Firebase token verification

```typescript
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
)
```

**Process:**
1. Extract token from `Authorization: Bearer <token>` header
2. Verify token with Firebase Admin SDK (`auth.verifyIdToken()`)
3. Get user data from Firestore
4. Attach to req.user: { id, email, fullName }
5. Call next() if valid, return 401 if invalid

**Optional middleware:**
```typescript
export async function optionalAuth(...)
```
- Same process but doesn't fail if no token
- Attaches user if present, continues either way

---

#### File: `middleware/auth.ts`

**Purpose:** Supabase JWT verification (alternative to Firebase)

**Same structure as auth-firebase.ts but uses Supabase client**

---

### Config

#### File: `config/firebase.ts`

**Purpose:** Firebase Admin SDK initialization

```typescript
import admin from 'firebase-admin';

// Initialize with service account
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

export const auth = admin.auth();
export const db = admin.firestore();

export const COLLECTIONS = {
  USERS: 'users',
  MESSAGES: 'messages',
  ACTION_ITEMS: 'action_items',
  TASKS: 'tasks'
};
```

---

#### File: `config/supabase.ts`

**Purpose:** Supabase client initialization

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Type definitions for tables
export interface Message {
  id: string;
  sender: string;
  content: string;
  // ...
}
```

---

## 🎨 Frontend Architecture

### Entry Point: `main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

### App Component: `App.tsx`

**Structure:**
```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="messages" element={<Messages />} />
              <Route path="action-items" element={<ActionItems />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="connect" element={<Connect />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

**Layout component:**
- Sidebar navigation
- Main content area
- Wraps all authenticated pages

---

### Context: `context/AuthContext.tsx`

**Purpose:** Global authentication state

```typescript
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Check for saved auth
    const token = localStorage.getItem('token');
    if (token) {
      // Verify token with backend
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);
  
  // ... login, register, logout functions
}
```

**Used by:** All pages, accessed via `useAuth()` hook

---

### API Service: `services/api.ts`

**Purpose:** Centralized API client

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
}

export const api = {
  // Messages
  getMessages: (filters) => fetch(`${API_BASE}/api/messages?...`),
  getMessage: (id) => fetch(`${API_BASE}/api/messages/${id}`),
  
  // Action items
  getActions: (filters) => fetch(`${API_BASE}/api/actions?...`),
  
  // WhatsApp
  getWhatsAppStatus: () => fetch(`${API_BASE}/api/whatsapp/status`),
  startWhatsApp: () => fetch(`${API_BASE}/api/whatsapp/start`, { method: 'POST' }),
  
  // ... more endpoints
};
```

---

### Page Components

**Common pattern:**
```typescript
export function PageName() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    loadData();
  }, []);
  
  async function loadData() {
    try {
      setLoading(true);
      const response = await api.getData();
      setData(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <div>
      {/* Page content */}
    </div>
  );
}
```

---

## 🔄 Data Flow Diagrams

### WhatsApp Message → Database Flow

```
WhatsApp Message Received
    ↓
Baileys Library (messages.upsert event)
    ↓
whatsapp-integrated.ts → handleNewMessage()
    ↓
    ├─→ Extract: sender, content, chat_name
    ├─→ Skip self messages
    └─→ Continue
    ↓
services/ai-classifier.classifyWithAI(content, sender, chat)
    ↓
    ├─→ Gemini API call
    ├─→ Get: category, priority, decision, reasoning
    ├─→ Extract action items
    └─→ Return result
    ↓
hybrid-message-store.create(message + classification)
    ↓
    ├─→ Try: firestore-message-store.create()
    │      └─→ Firebase Firestore .add()
    └─→ Catch: message-store.create()
           └─→ In-memory array.push()
    ↓
IF decision === 'create':
    hybrid-action-items.createFromMessage(messageId, actionItems)
    ↓
    Store action items
    ↓
Emit 'messageClassified' event
    ↓
SSE stream → Frontend updates
```

### Frontend Data Fetch Flow

```
User opens Messages page
    ↓
Component mounts → useEffect()
    ↓
api.getMessages(filters)
    ↓
fetch(`http://localhost:3001/api/messages?...`)
    ↓
    Headers: { Authorization: Bearer <token> }
    ↓
Backend: routes/messages-hybrid.ts
    ↓
    Middleware: requireAuth (verify token)
    ↓
    Route handler: GET /api/messages
    ↓
    hybrid-message-store.getAll(filters)
    ↓
    ├─→ Try: firestoreMessageStore.getAll()
    │      └─→ Firestore query
    └─→ Catch: messageStore.getAll()
           └─→ Filter in-memory array
    ↓
Return JSON: { success: true, data: [...messages] }
    ↓
Frontend: response.json()
    ↓
setMessages(data)
    ↓
Component re-renders with data
```

### Authentication Flow

```
User submits login form
    ↓
Prevent default form submission
    ↓
AuthContext.login(email, password)
    ↓
Firebase Client SDK: signInWithEmailAndPassword()
    ↓
Firebase Auth validates credentials
    ↓
Returns: { user, token }
    ↓
localStorage.setItem('token', token)
    ↓
setUser(user)
    ↓
Navigate to /dashboard
    ↓
All subsequent API calls include:
    Headers: { Authorization: Bearer <token> }
```

---

## 📦 Dependencies Explained

### Backend Critical Dependencies

**@whiskeysockets/baileys** - WhatsApp client
- Connects to WhatsApp Web
- Handles QR authentication
- Receives messages
- Manages sessions

**@google/generative-ai** - Gemini AI
- Text classification
- Action item extraction
- Semantic search
- Conversation summaries

**express** - Web framework
- HTTP server
- Routing
- Middleware

**firebase-admin** - Firebase backend SDK
- User authentication (verify tokens)
- Firestore database
- Server-side Firebase

**@supabase/supabase-js** - Supabase client
- PostgreSQL database
- Row-level security
- Real-time subscriptions

### Frontend Critical Dependencies

**react** - UI library
- Component-based UI
- State management
- Hooks

**react-router-dom** - Routing
- Page navigation
- Protected routes
- URL parameters

**firebase** - Firebase client SDK
- User authentication (login/register)
- Token management

**lucide-react** - Icons
- 1000+ icons
- Tree-shakeable
- Consistent design

---

## 🔐 Security Architecture

### Authentication Flow

```
Frontend                          Backend
   |                                 |
   |-- POST /api/auth/login -------->|
   |   Body: { email, password }     |
   |                                 |
   |                            Firebase Auth
   |                               verifies
   |                                 |
   |<--------- { token, user } ------|
   |                                 |
Store token in localStorage         |
   |                                 |
   |-- GET /api/messages ----------->|
   |   Header: Authorization: Bearer <token>
   |                                 |
   |                           Middleware:
   |                           requireAuth()
   |                                 |
   |                        Firebase verifies
   |                        token, extracts uid
   |                                 |
   |                          Attach req.user
   |                                 |
   |<--------- { messages } ---------|
```

### Protected Routes (Backend)

```typescript
// Unprotected (public)
GET /api/health
GET /api/whatsapp/status
POST /api/whatsapp/start

//Protected (require auth)
GET /api/messages        → requireAuth middleware
GET /api/actions         → requireAuth middleware
GET /api/auth/user       → requireAuth middleware
PATCH /api/auth/user     → requireAuth middleware
```

### Protected Routes (Frontend)

```typescript
<Route element={<RequireAuth />}>
  {/* All these routes require auth */}
  <Route path="dashboard" element={<Dashboard />} />
  <Route path="messages" element={<Messages />} />
  {/* etc */}
</Route>
```

**RequireAuth component:**
```typescript
function RequireAuth() {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" />;
  
  return <Outlet />; // Render child routes
}
```

---

## 🧪 Testing Patterns (Not Implemented)

**Recommended structure if adding tests:**

```
backend/
├── src/
│   └── [source files]
└── tests/
    ├── unit/
    │   ├── classifier.test.ts
    │   └── services.test.ts
    └── integration/
        ├── api.test.ts
        └── whatsapp.test.ts

frontend/
└── src/
    └── __tests__/
        ├── components/
        └── pages/
```

---

## 🚀 Build & Deployment

### Backend Build

```bash
cd backend
npm run build
```
- Compiles TypeScript → JavaScript
- Output: `dist/` folder
- Entry: `dist/index.js`

### Frontend Build

```bash
cd frontend/frontend
npm run build
```
- Vite bundles React app
- Output: `dist/` folder
- Static HTML/CSS/JS

### Production Start

**Backend:**
```bash
NODE_ENV=production node dist/index.js
```

**Frontend:**
- Serve `dist/` folder with any static file server
- Or deploy to Vercel/Netlify

---

**End of Code Architecture Documentation**
