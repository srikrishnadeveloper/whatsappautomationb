# WhatsApp Task Manager - Complete Project Documentation
**Last Updated:** February 21, 2026  
**Version:** 1.0.0

---

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [Backend Structure](#backend-structure)
6. [Frontend Structure](#frontend-structure)
7. [API Endpoints](#api-endpoints)
8. [Features](#features)
9. [Configuration](#configuration)
10. [Setup & Installation](#setup--installation)
11. [Code Structure Details](#code-structure-details)

---

## 🎯 Project Overview

**WhatsApp Task Manager** is an intelligent AI-powered application that:
- Connects to your WhatsApp account via QR code scanning
- Monitors incoming WhatsApp messages in real-time
- Uses **Google Gemini AI** to automatically classify messages
- Extracts actionable tasks from conversations
- Provides a modern web dashboard for task management
- Supports Firebase and Supabase for data persistence (with in-memory fallback)

### Key Value Proposition
Turns your WhatsApp messages into organized, actionable tasks automatically without manual categorization.

---

## 🔧 Tech Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js 4.22
- **Language:** TypeScript 5.9
- **WhatsApp Library:** @whiskeysockets/baileys 6.7.9
- **AI:** Google Generative AI (Gemini 2.0-flash)
- **Database Options:**
  - Firebase Admin SDK 13.6.0 (Firestore)
  - Supabase Client 2.89.0 (PostgreSQL)
  - In-memory storage (fallback)

### Frontend
- **Framework:** React 18.2
- **Build Tool:** Vite 5.0
- **Language:** TypeScript 5.3
- **Styling:** TailwindCSS 3.4
- **Icons:** Lucide React 0.294
- **Routing:** React Router DOM 6.21
- **Auth:** Firebase 12.7.0

### Infrastructure
- **API Communication:** REST + Server-Sent Events (SSE)
- **Real-time Updates:** SSE for live connection status and logs
- **Session Storage:** File-based (gitignored)
- **Security:** Helmet, CORS, Rate Limiting

---

## 🏗️ Architecture

### System Architecture
```
┌─────────────────┐
│  WhatsApp App   │ ──QR Scan──┐
└─────────────────┘             │
                                ▼
                    ┌───────────────────┐
                    │   Baileys Library │
                    │  (WhatsApp Client)│
                    └──────┬────────────┘
                           │
                           ▼
                    ┌──────────────────┐
┌──────────────┐    │  Express Backend │    ┌────────────┐
│ React Frontend│◄──┤   - API Routes   │───►│ Gemini AI  │
│  (Dashboard)  │    │   - Services     │    │ Classifier │
└──────────────┘    │   - Middleware   │    └────────────┘
                    └──────┬───────────┘
                           │
                    ┌──────▼───────────┐
                    │  Storage Layer   │
                    │  - Firebase      │
                    │  - Supabase      │
                    │  - In-Memory     │
                    └──────────────────┘
```

### Data Flow
1. **WhatsApp Connection:** User scans QR → Baileys connects → Session stored
2. **Message Received:** WhatsApp → Baileys → Backend service
3. **AI Classification:** Message → Gemini API → Classification result
4. **Storage:** Classified message → Firebase/Supabase/Memory
5. **Real-time Updates:** SSE stream → Frontend dashboard updates
6. **User Interaction:** Frontend → API calls → Backend → Storage

---

## 🗄️ Database Schema

### Tables

#### 1. **messages**
Stores all WhatsApp messages with AI classification results.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| sender | TEXT | Message sender name/number |
| chat_name | TEXT | Group or contact name |
| timestamp | TIMESTAMPTZ | Message timestamp |
| content | TEXT | Message content |
| message_type | TEXT | text, image, video, audio, document, sticker |
| classification | TEXT | work, study, personal, ignore |
| decision | TEXT | create, ignore, review |
| notion_page_id | TEXT | (Reserved for Notion integration) |
| ai_reasoning | TEXT | AI explanation for classification |
| metadata | JSONB | Additional data (attachments, etc.) |
| created_at | TIMESTAMPTZ | Record creation time |
| updated_at | TIMESTAMPTZ | Last update time |
| user_id | UUID | User who owns this message (FK) |

**Indexes:**
- `idx_messages_timestamp` (DESC)
- `idx_messages_classification`
- `idx_messages_decision`
- `idx_messages_sender`
- `idx_messages_user_id`

#### 2. **tasks**
Tracks action items created from messages.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| message_id | UUID | Foreign key to messages |
| notion_page_id | TEXT | (Reserved) |
| notion_database_id | TEXT | (Reserved) |
| task_title | TEXT | Task title |
| task_category | TEXT | work, study, personal |
| task_priority | TEXT | urgent, high, medium, low |
| task_status | TEXT | To Do, In Progress, Done |
| due_date | TIMESTAMPTZ | Task deadline |
| completed_at | TIMESTAMPTZ | Completion timestamp |
| created_at | TIMESTAMPTZ | Record creation |
| updated_at | TIMESTAMPTZ | Last update |
| user_id | UUID | Task owner (FK) |

**Indexes:**
- `idx_tasks_notion_page`
- `idx_tasks_status`
- `idx_tasks_user_id`

#### 3. **rules**
Custom filtering and classification rules.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| rule_type | TEXT | always-important, always-ignore, keyword, contact, group |
| contact_name | TEXT | Contact to match |
| group_name | TEXT | Group to match |
| keywords | TEXT[] | Array of keywords |
| priority | TEXT | urgent, high, medium, low |
| category | TEXT | work, study, personal |
| is_active | BOOLEAN | Rule enabled/disabled |
| created_at | TIMESTAMPTZ | Created at |
| updated_at | TIMESTAMPTZ | Updated at |
| user_id | UUID | Rule owner (FK) |

**Indexes:**
- `idx_rules_type`
- `idx_rules_active`
- `idx_rules_user_id`

#### 4. **feedback**
Tracks user corrections for AI learning.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| message_id | UUID | Foreign key to messages |
| original_decision | TEXT | AI's original decision |
| corrected_decision | TEXT | User's correction |
| user_comment | TEXT | Optional feedback |
| created_at | TIMESTAMPTZ | Created at |

#### 5. **profiles**
User profile information (extends auth.users).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (references auth.users) |
| email | TEXT | User email |
| full_name | TEXT | Full name |
| avatar_url | TEXT | Profile picture URL |
| phone | TEXT | Phone number |
| created_at | TIMESTAMPTZ | Created at |
| updated_at | TIMESTAMPTZ | Updated at |

---

## 🔌 Backend Structure

### Directory Layout
```
backend/
├── src/
│   ├── classifier/           # Message classification logic
│   │   ├── ai-classifier.ts      # Gemini AI classifier
│   │   ├── rule-based.ts         # Fallback rule-based classifier
│   │   ├── keywords.ts           # Classification keywords
│   │   └── deadline-parser.ts    # Extract deadlines from text
│   │
│   ├── config/              # Configuration
│   │   ├── firebase.ts          # Firebase Admin setup
│   │   └── supabase.ts          # Supabase client setup
│   │
│   ├── middleware/          # Express middleware
│   │   ├── auth.ts              # Supabase JWT auth
│   │   └── auth-firebase.ts     # Firebase token verification
│   │
│   ├── routes/              # API endpoints
│   │   ├── whatsapp.ts          # WhatsApp control & status
│   │   ├── messages-hybrid.ts   # Message CRUD (hybrid storage)
│   │   ├── action-items-hybrid.ts # Action items (hybrid)
│   │   ├── stats-hybrid.ts      # Statistics (hybrid)
│   │   ├── classify.ts          # Manual classification
│   │   ├── health.ts            # Health check
│   │   ├── logs.ts              # Activity logs
│   │   ├── search.ts            # AI-powered search
│   │   ├── auth-firebase.ts     # Firebase auth routes
│   │   └── daily-summary.ts     # Daily summary (NOT MOUNTED)
│   │
│   ├── services/            # Business logic
│   │   ├── whatsapp-integrated.ts    # WhatsApp client logic
│   │   ├── hybrid-message-store.ts   # Hybrid storage for messages
│   │   ├── hybrid-action-items.ts    # Hybrid action items storage
│   │   ├── message-store.ts          # In-memory message store
│   │   ├── action-items.ts           # In-memory action items
│   │   ├── firestore-message-store.ts # Firebase storage
│   │   ├── firestore-action-items.ts  # Firebase action items
│   │   ├── ai-classifier.ts          # AI classification service
│   │   ├── ai-search.ts              # AI search service
│   │   ├── activity-log.ts           # Activity logging
│   │   └── system-state.ts           # System state management
│   │
│   └── index.ts             # Express app entry point
│
├── database/
│   ├── schema.sql               # Initial DB schema
│   └── migrations/
│       └── 001_add_user_auth.sql  # User auth migration
│
├── .env                     # Environment variables
├── .env.example             # Example environment config
├── package.json
└── tsconfig.json
```

### Key Backend Services

#### 1. **whatsapp-integrated.ts**
- Manages Baileys WhatsApp connection
- Handles QR code generation
- Processes incoming messages
- Maintains connection state
- Broadcasts events via EventEmitter

#### 2. **hybrid-message-store.ts**
- Provides unified interface for message storage
- Tries Firebase first, falls back to in-memory
- Used by all message-related routes

#### 3. **ai-classifier.ts (services/)**
- Uses Gemini API to classify messages
- Extracts action items with deadlines
- Provides structured classification results
- Falls back to rule-based on API failure

#### 4. **ai-search.ts**
- AI-powered semantic search across messages
- Generates conversation summaries
- Answers natural language queries about messages

#### 5. **activity-log.ts**
- Centralized logging system
- Color-coded console output
- SSE stream for frontend

---

## 🎨 Frontend Structure

### Directory Layout
```
frontend/frontend/
├── src/
│   ├── pages/               # Route pages
│   │   ├── Dashboard.tsx        # Overview page
│   │   ├── Messages.tsx         # Message list
│   │   ├── ActionItems.tsx      # Action items list
│   │   ├── Tasks.tsx            # Task management
│   │   ├── Connect.tsx          # WhatsApp connection
│   │   ├── Settings.tsx         # App settings
│   │   ├── Login.tsx            # User login
│   │   └── Register.tsx         # User registration
│   │
│   ├── components/          # Reusable components
│   │   ├── Sidebar.tsx          # Navigation sidebar
│   │   ├── MessageRow.tsx       # Message list item
│   │   ├── ActionItemRow.tsx    # Action item component
│   │   ├── TaskRow.tsx          # Task list item
│   │   └── ActivityLog.tsx      # Live activity feed
│   │
│   ├── context/             # React context
│   │   └── AuthContext.tsx      # Authentication state
│   │
│   ├── services/            # API clients
│   │   └── api.ts               # API service functions
│   │
│   ├── config/
│   │   └── firebase.ts          # Firebase config
│   │
│   ├── App.tsx              # Root component
│   ├── main.tsx             # React entry point
│   └── index.css            # Global styles
│
├── public/
│   └── logo.png
│
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

### UI Design Philosophy

**Inspired by:** Superhuman, Linear  
**Characteristics:**
- Clean, minimal interface
- Soft shadows and glassmorphism
- High information density
- WhatsApp green accent (#25D366)
- Light/dark mode support
- Responsive grid layouts

### Key Pages

#### 1. **Connect** (`/connect`)
- QR code display for WhatsApp connection
- Real-time connection status
- Activity log with SSE updates
- Connect/Disconnect controls

#### 2. **Dashboard** (`/dashboard`)
- Statistics cards (Total, Pending, Completed, Messages)
- Recent tasks list
- Message classification breakdown
- Quick action buttons

#### 3. **Messages** (`/messages`)
- Chronological message feed
- Filterable by category, priority, decision
- Expandable rows showing full content
- AI reasoning display
- Search functionality

#### 4. **Action Items** (`/action-items`)
- Extracted tasks from messages
- Confidence scores
- Priority badges
- Convert to Task button
- Edit modal for refinement

#### 5. **Tasks** (`/tasks`)
- Sectioned by Today, Upcoming, Later
- Custom checkbox design
- Priority filters (High, Medium, Low)
- Due date display
- Mark complete functionality

#### 6. **Settings** (`/settings`)
- System status indicators (DB, WhatsApp, AI)
- User preferences
- Account information
- Theme toggle

---

## 📡 API Endpoints

### WhatsApp Control
| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/api/whatsapp/status` | Get connection status | status, isConnected, phoneNumber |
| POST | `/api/whatsapp/start` | Start WhatsApp connection | success, message |
| POST | `/api/whatsapp/stop` | Disconnect WhatsApp | success, message |
| POST | `/api/whatsapp/logout` | Logout & clear session | success, message |
| GET | `/api/whatsapp/qr` | Get QR code (text) | qrAvailable, qrCode |
| GET | `/api/whatsapp/qr-image` | Get QR code (image) | Base64 PNG image |
| GET | `/api/whatsapp/events` | SSE stream for updates | Event stream |

### Messages
| Method | Endpoint | Description | Query Params |
|--------|----------|-------------|--------------|
| GET | `/api/messages` | List all messages | category, priority, decision, limit, userId |
| GET | `/api/messages/:id` | Get single message | - |
| GET | `/api/messages/stats` | Message statistics | userId |
| PATCH | `/api/messages/:id` | Update message | - |
| DELETE | `/api/messages/:id` | Delete message | - |

### Action Items
| Method | Endpoint | Description | Query Params |
|--------|----------|-------------|--------------|
| GET | `/api/actions` | List action items | priority, status, limit, userId |
| GET | `/api/actions/:id` | Get single item | - |
| GET | `/api/actions/stats` | Action item stats | userId |
| GET | `/api/actions/stream` | SSE stream | - |
| POST | `/api/actions` | Create action item | - |
| PATCH | `/api/actions/:id` | Update item | - |
| DELETE | `/api/actions/:id` | Delete item | - |

### Statistics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Overall statistics |
| GET | `/api/stats/timeline` | Message timeline by date |
| GET | `/api/stats/top-senders` | Top message senders |
| GET | `/api/stats/summary` | Quick dashboard summary |

### Classification
| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| POST | `/api/classify` | Classify text | content, sender, chat_name |
| POST | `/api/classify/batch` | Batch classify | messages[] |

### Search (AI)
| Method | Endpoint | Description | Body/Params |
|--------|----------|-------------|-------------|
| POST | `/api/search` | AI search messages | query, userId |
| GET | `/api/search/person/:name` | Person summary | name (param), userId |

### Authentication (Firebase)
| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create account | email, password, fullName |
| POST | `/api/auth/login` | Login | email, password |
| POST | `/api/auth/logout` | Logout | - |
| GET | `/api/auth/user` | Get current user | - (requires auth) |
| PATCH | `/api/auth/user` | Update profile | fullName, phone (requires auth) |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/logs` | Activity logs |
| GET | `/api/logs/stream` | SSE log stream |

---

## ✨ Features

### ✅ Implemented
1. **WhatsApp Integration**
   - QR code authentication
   - Real-time message monitoring
   - Connection status tracking
   - Auto-reconnect on disconnect
   - Session persistence

2. **AI Classification**
   - Gemini 2.0-flash integration
   - Categories: work, study, personal, ignore
   - Priority: urgent, high, medium, low
   - Decision: create, review, ignore
   - Fallback to rule-based classifier

3. **Action Item Extraction**
   - AI extracts tasks from messages
   - Deadline parsing
   - Priority assignment
   - Task type detection (meeting, deadline, reminder, etc.)

4. **AI Search**
   - Natural language queries
   - Semantic search across messages
   - Conversation summaries
   - Person-based search

5. **Real-time Updates**
   - SSE for connection status
   - Live activity logs
   - Instant UI updates

6. **Storage Flexibility**
   - Firebase Firestore support
   - Supabase PostgreSQL support
   - In-memory fallback
   - Hybrid storage pattern

7. **User Authentication**
   - Firebase Auth integration
   - JWT token verification
   - Protected routes
   - User profiles

8. **Modern UI**
   - WhatsApp-themed design
   - Dark/light mode
   - Responsive layout
   - Smooth animations

### 🚧 Not Implemented / Reserved
1. **Notion Integration** (notion_page_id fields reserved)
2. **Daily Summary Route** (exists but not mounted)
3. **Rules CRUD Operations** (table exists, no UI)
4. **Feedback System** (table exists, no UI)
5. **Task Status Updates** (tasks table exists, limited usage)

---

## ⚙️ Configuration

### Environment Variables

#### Backend `.env`
```env
# Server
PORT=3001
FRONTEND_URL=http://localhost:5173

# WhatsApp
AUTO_START_WHATSAPP=true

# Google AI
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_AI_API_KEY=your_gemini_api_key_here

# Firebase (Optional)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Supabase (Optional)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Database (if using PostgreSQL directly)
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

#### Frontend `.env`
```env
VITE_API_BASE_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- Google AI API key ([Get one here](https://aistudio.google.com/apikey))
- (Optional) Firebase project
- (Optional) Supabase project

### Step 1: Clone & Install
```bash
# Clone the repository
cd Whatsapp

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend/frontend
npm install
```

### Step 2: Configure Environment
```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your API keys

# Frontend
cd ../frontend/frontend
cp .env.example .env
# Edit .env with your Firebase config
```

### Step 3: Run the Application

**Option 1: VS Code Tasks (Recommended)**
```
Press Ctrl+Shift+B → Select "Start Full Application"
```

**Option 2: Manual Start**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend/frontend
npm run dev
```

### Step 4: Access the App
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001

### Step 5: Connect WhatsApp
1. Navigate to `/connect` in the UI
2. Click "Connect WhatsApp"
3. Scan QR code with WhatsApp mobile app
4. Wait for connection confirmation
5. Messages will now be processed automatically

---

## 📚 Code Structure Details

### Backend Services Hierarchy

```
whatsapp-integrated.ts
├─► Manages Baileys connection
├─► Emits events on new messages
└─► Used by: routes/whatsapp.ts

hybrid-message-store.ts
├─► Firebase attempt (if configured)
├─► Fallback to in-memory
└─► Used by: routes/messages-hybrid.ts, routes/stats-hybrid.ts

hybrid-action-items.ts
├─► Firebase attempt (if configured)
├─► Fallback to in-memory
└─► Used by: routes/action-items-hybrid.ts

ai-classifier.ts (services/)
├─► Calls Gemini API
├─► Extracts action items
├─► Falls back to rule-based
└─► Used by: action-items services, message classification

ai-search.ts
├─► Semantic search with Gemini
├─► Generates summaries
└─► Used by: routes/search.ts
```

### Classifier Flow
```
Message Content
    │
    ▼
services/ai-classifier.ts
    │
    ├─► Google Gemini API
    │   ├─► Success: AI classification + action items
    │   └─► Error: Falls back to rule-based
    │
    └─► classifier/rule-based.ts
        └─► Keyword matching (WORK_KEYWORDS, STUDY_KEYWORDS, etc.)
```

### Storage Pattern (Hybrid)
```
API Route (e.g., POST /api/messages)
    │
    ▼
hybrid-message-store.getAll()
    │
    ├─► Try: firestore-message-store.getAll()
    │   ├─► Success: Return Firebase data
    │   └─► Error: Fallback ▼
    │
    └─► Use: message-store.getAll() (in-memory)
        └─► Return in-memory data
```

### Authentication Flow (Firebase)
```
Frontend Login
    │
    ▼
Firebase Client SDK signInWithEmailAndPassword()
    │
    ├─► Success: Get ID token
    │
    ▼
Store token in localStorage
    │
    ▼
API Requests → Authorization: Bearer <token>
    │
    ▼
Backend middleware/auth-firebase.ts
    │
    ├─► Verify token with Firebase Admin
    │
    ├─► Success: Attach req.user, continue
    │
    └─► Error: 401 Unauthorized
```

---

## 🔑 Key Dependencies & Versions

### Backend
```json
{
  "@google/generative-ai": "^0.2.1",      // Gemini AI
  "@whiskeysockets/baileys": "^6.7.9",    // WhatsApp client
  "firebase-admin": "^13.6.0",            // Firebase backend
  "@supabase/supabase-js": "^2.89.0",     // Supabase client
  "express": "^4.22.1",                   // Web framework
  "express-rate-limit": "^7.5.1",         // Rate limiting
  "helmet": "^7.2.0",                     // Security headers
  "cors": "^2.8.5",                       // CORS
  "qrcode": "^1.5.4",                     // QR generation
  "pino": "^9.6.0",                       // Logging (Baileys)
  "@hapi/boom": "^10.0.1"                 // Error handling (Baileys)
}
```

### Frontend
```json
{
  "react": "^18.2.0",                     // UI library
  "react-router-dom": "^6.21.1",          // Routing
  "firebase": "^12.7.0",                  // Firebase client
  "lucide-react": "^0.294.0",             // Icons
  "vite": "^5.0.10",                      // Build tool
  "tailwindcss": "^3.4.0"                 // Styling
}
```

---

## 🎯 Classification Categories

### Categories
- **work:** Professional tasks, meetings, projects, deadlines
- **study:** Academic content, assignments, exams, lectures
- **personal:** Personal tasks, family, health, appointments
- **ignore:** Greetings, spam, promotional content

### Priorities
- **urgent:** ASAP, emergency, immediate action required
- **high:** Important but not time-critical
- **medium:** Standard priority
- **low:** Nice to have, not critical

### Decisions
- **create:** Should become a task
- **review:** Needs human review
- **ignore:** No action needed

---

## 📊 Message Processing Pipeline

```
WhatsApp Message Received
    │
    ▼
whatsapp-integrated.ts → handleNewMessage()
    │
    ├─► Extract: sender, content, chat_name, timestamp
    │
    ▼
services/ai-classifier.classifyWithAI()
    │
    ├─► Call Gemini API
    ├─► Get: category, priority, decision, reasoning
    ├─► Extract: action items with deadlines
    │
    ▼
hybrid-message-store.create()
    │
    ├─► Save to Firebase/Supabase
    ├─► Fallback to in-memory
    │
    ▼
IF decision === 'create': hybrid-action-items.create()
    │
    ├─► Store action items
    │
    ▼
Emit event: 'messageClassified'
    │
    ▼
SSE stream → Frontend updates in real-time
```

---

## 🔐 Security Features

1. **Authentication**
   - Firebase JWT tokens
   - Token verification middleware
   - Protected API routes

2. **CORS**
   - Whitelist allowed origins
   - Credentials support
   - Vercel preview URL support

3. **Rate Limiting**
   - 1000 requests per minute per IP
   - Applied to all `/api/*` routes

4. **Headers**
   - Helmet.js security headers
   - XSS protection
   - Content Security Policy

5. **Session Storage**
   - WhatsApp session in `_IGNORE_session/`
   - Gitignored for security
   - File-based persistence

---

## 📝 Unused/Incomplete Features

### Database Tables Not Fully Used
1. **tasks** table
   - Schema exists
   - Not actively used in UI
   - Reserved for full task management

2. **rules** table
   - Schema exists
   - No CRUD routes
   - Default rules inserted, not editable

3. **feedback** table
   - Schema exists
   - No UI or routes
   - Reserved for AI learning

### Routes Not Mounted
1. **daily-summary.ts**
   - File exists
   - Route not imported in index.ts
   - Can be enabled by importing

### Dependencies Not Used
- `pino` - Only used by Baileys, not custom logging
- `@hapi/boom` - Only used by Baileys error handling

---

## 🎨 UI Color Palette

```css
/* Primary Colors */
--whatsapp-green: #25D366
--text-primary: #111827
--text-secondary: #6B7280
--bg-primary: #FFFFFF
--bg-secondary: #F9FAFB

/* Dark Mode */
--dark-bg-primary: #1F2937
--dark-bg-secondary: #111827
--dark-text-primary: #F9FAFB
--dark-text-secondary: #9CA3AF

/* Status Colors */
--success: #10B981
--warning: #F59E0B
--error: #EF4444
--info: #3B82F6
```

---

## 📱 Supported Message Types

WhatsApp message types processed by the system:
- ✅ **text** - Regular text messages
- ✅ **image** - Images with captions
- ✅ **video** - Video files
- ✅ **audio** - Voice messages
- ✅ **document** - PDF, DOCX, etc.
- ⚠️ **sticker** - Logged but not classified
- ⚠️ **contact** - Logged but not classified

---

## 🚀 Deployment Considerations

### Backend
- **Platform:** Render, Railway, Fly.io, VPS
- **Port:** Configurable via `PORT` env var (default 3001)
- **Session Storage:** Ensure `_IGNORE_session/` is persistent
- **Environment:** All keys in production `.env`

### Frontend
- **Platform:** Vercel (optimized for Vite)
- **Build:** `npm run build` → `dist/`
- **Environment:** Set `VITE_*` variables in Vercel dashboard
- **API URL:** Update `VITE_API_BASE_URL` to backend URL

### Database
- **Recommendation:** Supabase (PostgreSQL) for production
- **Scaling:** Firebase Firestore also supported
- **Fallback:** In-memory works but not persistent

---

## 📞 Support & Troubleshooting

### Common Issues

**1. WhatsApp Won't Connect**
- Ensure AUTO_START_WHATSAPP=true
- Delete `_IGNORE_session/` folder and retry
- Check if WhatsApp Web is logged out on other devices

**2. AI Classification Not Working**
- Verify GEMINI_API_KEY is set
- Check API quota at https://aistudio.google.com/
- Falls back to rule-based automatically

**3. Database Connection Failed**
- Verify Firebase/Supabase credentials
- System will fallback to in-memory storage
- Check health at `/api/health`

**4. QR Code Not Showing**
- Check backend logs for errors
- Ensure frontend can reach `/api/whatsapp/qr-image`
- Try manual start: POST `/api/whatsapp/start`

---

## 📄 License

MIT License - Feel free to use and modify

---

## 👨‍💻 Development Notes

**Last Updated:** February 21, 2026  
**Status:** Production-ready with optional features  
**Known Issues:** None critical  
**Future Roadmap:**
- Notion API integration
- Advanced rule management UI
- Feedback system for AI training
- Mobile app (React Native)
- Multi-language support

---

**End of Documentation**
