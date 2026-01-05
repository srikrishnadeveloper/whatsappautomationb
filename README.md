# 🚀 WhatsApp Task Manager - Backend

> Transform your WhatsApp messages into actionable tasks with the power of AI! 

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.22.1-lightgrey.svg)](https://expressjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📖 Overview

WhatsApp Task Manager is an intelligent backend service that seamlessly integrates with WhatsApp to automatically analyze, classify, and convert your messages into organized tasks. Powered by Google's Gemini AI, this system intelligently understands context, extracts action items, and helps you stay on top of your commitments without manual effort.

### ✨ Key Features

- 🤖 **AI-Powered Classification** - Leverages Google Gemini AI to intelligently categorize messages (work, study, personal, urgent, casual, spam)
- 📱 **WhatsApp Integration** - Pure WebSocket connection using Baileys (no Chrome/Puppeteer needed!)
- 🎯 **Smart Action Extraction** - Automatically detects deadlines, meetings, reminders, and tasks
- 📊 **Real-time Analytics** - Track message statistics, classification trends, and activity logs
- 🔐 **Secure Authentication** - Firebase Auth integration for user management
- 💾 **Hybrid Storage** - Supports both Firestore and Supabase with in-memory fallback
- 🔍 **AI-Powered Search** - Semantic search across messages and tasks
- ⚡ **Stateless Deployment** - Works on Render, Railway, Fly.io, and other cloud platforms
- 🛡️ **Security First** - Helmet.js, CORS, rate limiting, and security best practices
- 📝 **Activity Logging** - Comprehensive system activity tracking

## 🏗️ Architecture

```
┌─────────────────┐
│   WhatsApp      │
│   (via Baileys) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Express API Server              │
│  ┌──────────────────────────────────┐  │
│  │     Message Classification       │  │
│  │  (Gemini AI + Rule-Based)        │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │      Action Item Extraction      │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │    Analytics & Search Engine     │  │
│  └──────────────────────────────────┘  │
└─────────┬───────────────────┬───────────┘
          │                   │
          ▼                   ▼
    ┌─────────┐         ┌──────────┐
    │Firebase │         │ Supabase │
    │Firestore│         │PostgreSQL│
    └─────────┘         └──────────┘
```

## 🛠️ Tech Stack

### Core Technologies
- **Runtime**: Node.js 20.x
- **Language**: TypeScript 5.9.3
- **Framework**: Express.js 4.22.1
- **WhatsApp Integration**: @whiskeysockets/baileys 6.7.9

### AI & Machine Learning
- **AI Model**: Google Gemini 2.0 Flash
- **AI SDK**: @google/generative-ai 0.2.1
- **Classification**: Hybrid AI + Rule-based system

### Databases
- **NoSQL**: Firebase Firestore
- **SQL**: Supabase PostgreSQL
- **Storage Strategy**: Hybrid with in-memory fallback

### Security & Performance
- **Security**: Helmet.js, CORS, Express Rate Limit
- **Logging**: Pino (high-performance logging)
- **Compression**: Built-in response compression
- **HTTP Logging**: Morgan

### Development Tools
- **Dev Server**: ts-node-dev (auto-restart)
- **Type Checking**: TypeScript strict mode
- **Package Manager**: npm

## 📂 Project Structure

```
whatsappautomationb/
├── src/
│   ├── index.ts                    # Main server entry point
│   ├── routes/                     # API route handlers
│   │   ├── whatsapp.ts            # WhatsApp control endpoints
│   │   ├── messages-hybrid.ts     # Message management
│   │   ├── classify.ts            # Classification API
│   │   ├── action-items-hybrid.ts # Action items API
│   │   ├── stats-hybrid.ts        # Analytics endpoints
│   │   ├── search.ts              # AI-powered search
│   │   ├── auth-firebase.ts       # Authentication
│   │   ├── logs.ts                # Activity logs
│   │   └── health.ts              # Health check
│   ├── services/                   # Business logic
│   │   ├── whatsapp-integrated.ts # WhatsApp client service
│   │   ├── ai-classifier.ts       # Gemini AI classification
│   │   ├── ai-search.ts           # Semantic search
│   │   ├── hybrid-message-store.ts# Message storage layer
│   │   ├── hybrid-action-items.ts # Action items storage
│   │   ├── activity-log.ts        # System logging
│   │   └── system-state.ts        # System state management
│   ├── classifier/                 # Classification logic
│   │   ├── ai-classifier.ts       # AI-based classification
│   │   ├── rule-based.ts          # Rule-based fallback
│   │   ├── keywords.ts            # Keyword matching
│   │   └── deadline-parser.ts     # Date/time extraction
│   ├── config/                     # Configuration
│   │   ├── firebase.ts            # Firebase setup
│   │   └── supabase.ts            # Supabase setup
│   └── middleware/                 # Express middleware
│       ├── auth-firebase.ts       # Auth middleware
│       └── auth.ts                # Auth utilities
├── database/                       # Database schemas
│   ├── schema.sql                 # PostgreSQL schema
│   └── migrations/                # Database migrations
├── .env.example                    # Environment variables template
├── package.json                    # Dependencies & scripts
├── tsconfig.json                   # TypeScript configuration
└── README.md                       # This file
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **npm** or **yarn**
- **Google AI API Key** ([Get it here](https://aistudio.google.com/app/apikey))
- **Supabase Account** (optional, for PostgreSQL) ([Sign up](https://supabase.com))
- **Firebase Project** (optional, for Firestore) ([Create one](https://firebase.google.com))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/srikrishnadeveloper/whatsappautomationb.git
   cd whatsappautomationb
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure:
   ```env
   # Server Configuration
   PORT=8080
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173
   AUTO_START_WHATSAPP=true
   
   # Google AI (Gemini)
   GOOGLE_AI_API_KEY=your_google_ai_api_key_here
   
   # Supabase (Optional)
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_PROJECT_REF=your_project_ref
   
   # AI Settings
   AI_ENABLED=true
   USE_RULES_FALLBACK=true
   ```

4. **Set up the database** (if using Supabase)
   ```bash
   # Run the SQL schema in your Supabase SQL editor
   cat database/schema.sql
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

### Running the Application

#### Development Mode (with auto-reload)
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

The server will start on `http://localhost:8080` (or your configured PORT).

## 📱 WhatsApp Setup

### First-Time Connection

1. Start the server with `AUTO_START_WHATSAPP=true` in your `.env`
2. The server will display a QR code in the terminal
3. Open WhatsApp on your phone → Settings → Linked Devices
4. Scan the QR code
5. Your WhatsApp is now connected! 🎉

### Session Persistence

- Sessions are automatically saved to **Firestore** (if configured)
- Falls back to **local file storage** if Firestore is unavailable
- Works seamlessly on stateless hosting platforms like Render

## 🔌 API Endpoints

### Health & Status
- `GET /api/health` - Server health check
- `GET /api/whatsapp/status` - WhatsApp connection status

### WhatsApp Control
- `POST /api/whatsapp/start` - Start WhatsApp connection
- `POST /api/whatsapp/stop` - Stop WhatsApp connection
- `POST /api/whatsapp/logout` - Logout and clear session
- `GET /api/whatsapp/qr` - Get current QR code

### Messages
- `GET /api/messages` - List all messages (paginated)
- `GET /api/messages/:id` - Get specific message
- `POST /api/messages` - Create message manually
- `PUT /api/messages/:id` - Update message
- `DELETE /api/messages/:id` - Delete message

### Classification
- `POST /api/classify` - Classify text using AI
  ```json
  {
    "content": "Can we schedule a meeting tomorrow at 3pm?",
    "sender": "John Doe"
  }
  ```

### Action Items
- `GET /api/actions` - List all action items
- `GET /api/actions/:id` - Get specific action item
- `POST /api/actions` - Create action item
- `PUT /api/actions/:id` - Update action item
- `DELETE /api/actions/:id` - Delete action item
- `PATCH /api/actions/:id/complete` - Mark as complete

### Analytics
- `GET /api/stats` - Get overall statistics
- `GET /api/stats/daily` - Daily statistics
- `GET /api/stats/trends` - Classification trends

### Search
- `POST /api/search` - AI-powered semantic search
  ```json
  {
    "query": "meetings about project deadline",
    "limit": 10
  }
  ```

### Activity Logs
- `GET /api/logs` - Get system activity logs

### Authentication
- `POST /api/auth/login` - User login (Firebase)
- `POST /api/auth/signup` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

## 🤖 AI Classification System

The system uses a **hybrid approach** for message classification:

### 1. AI-Powered Classification (Primary)
- Uses **Google Gemini 2.0 Flash**
- Analyzes context, intent, and urgency
- Extracts action items automatically
- Understands natural language deadlines

### 2. Rule-Based Classification (Fallback)
- Keyword matching
- Pattern recognition
- Contact/group-based rules
- Custom filtering preferences

### Classification Categories
- **Work**: Professional tasks, meetings, projects
- **Study**: Assignments, exams, academic content
- **Personal**: Personal commitments, reminders
- **Urgent**: Time-sensitive items requiring immediate attention
- **Casual**: Informal conversations, greetings
- **Spam**: Promotional content, forwarded messages

### Priority Levels
- **High**: Urgent deadlines, important meetings
- **Medium**: Regular tasks, scheduled events
- **Low**: Optional items, casual reminders
- **None**: Ignore, no action needed

## 🗄️ Database Schema

The system supports both **Supabase (PostgreSQL)** and **Firebase Firestore**.

### Main Tables

#### Messages
Stores all incoming WhatsApp messages with classification results.

```sql
- id (UUID)
- sender (TEXT)
- chat_name (TEXT)
- timestamp (TIMESTAMPTZ)
- content (TEXT)
- message_type (TEXT)
- classification (TEXT)
- decision (TEXT)
- ai_reasoning (TEXT)
- metadata (JSONB)
```

#### Rules
Custom filtering preferences and automation rules.

```sql
- id (UUID)
- rule_type (TEXT)
- contact_name (TEXT)
- keywords (TEXT[])
- priority (TEXT)
- category (TEXT)
- is_active (BOOLEAN)
```

#### Tasks
Tracks action items created from messages.

```sql
- id (UUID)
- message_id (UUID)
- task_title (TEXT)
- task_category (TEXT)
- task_priority (TEXT)
- task_status (TEXT)
- due_date (TIMESTAMPTZ)
```

See `database/schema.sql` for the complete schema.

## 🔒 Security Features

- **Helmet.js**: Secure HTTP headers
- **CORS**: Configurable cross-origin policies
- **Rate Limiting**: 1000 requests/minute per IP
- **Input Validation**: Sanitized inputs
- **Environment Variables**: Sensitive data protection
- **Firebase Auth**: Secure user authentication
- **Trusted Proxy**: Support for reverse proxies

## 🌐 Deployment

### Deploying to Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure environment variables in Render dashboard
4. Set build command: `npm install && npm run build`
5. Set start command: `npm start`
6. Deploy! 🚀

### Environment Variables for Production

Ensure these are set in your hosting platform:

```
PORT=8080
NODE_ENV=production
FRONTEND_URL=https://your-frontend.com
GOOGLE_AI_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
AUTO_START_WHATSAPP=true
```

## 🧪 Testing

```bash
# Run tests
npm test

# Build TypeScript
npm run build

# Development mode
npm run dev
```

## 📊 Performance

- **Lightweight**: Pure WebSocket (no browser automation)
- **Fast**: Pino logging, compression enabled
- **Scalable**: Stateless architecture, cloud-ready
- **Efficient**: Hybrid storage with intelligent fallback

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Use TypeScript strict mode
- Follow existing code style
- Add comments for complex logic
- Update documentation as needed
- Test your changes thoroughly

## 📝 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Baileys** - WhatsApp Web API implementation
- **Google Gemini AI** - Advanced AI classification
- **Supabase** - Postgres database platform
- **Firebase** - Authentication and Firestore
- **Express.js** - Web framework

## 📧 Support

For issues, questions, or suggestions:
- Open an [Issue](https://github.com/srikrishnadeveloper/whatsappautomationb/issues)
- Contact: [srikrishnadeveloper](https://github.com/srikrishnadeveloper)

---

<div align="center">
  
**Made with ❤️ by [srikrishnadeveloper](https://github.com/srikrishnadeveloper)**

⭐ Star this repository if you find it helpful!

</div>
