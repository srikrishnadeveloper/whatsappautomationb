# WhatsApp Task Manager - Backend API

A powerful backend API that integrates with WhatsApp to automatically classify messages, extract action items, and manage tasks using AI-powered classification.

## 🚀 Features

- **WhatsApp Integration**: Seamless connection with WhatsApp using Baileys library
- **AI-Powered Classification**: Leverages Google's Gemini AI to intelligently classify messages into categories:
  - Action Items (tasks that need to be done)
  - Questions (queries requiring responses)
  - Information (general messages)
  - Casual (non-work related chats)
- **Smart Action Item Extraction**: Automatically extracts tasks with deadlines and priorities
- **Hybrid Storage System**: Supports both Firebase/Firestore and in-memory storage with automatic fallback
- **AI Search**: Semantic search across messages using AI embeddings
- **Firebase Authentication**: Secure user authentication and authorization
- **Real-time Statistics**: Track message volumes, classification accuracy, and system performance
- **Activity Logging**: Comprehensive logging of all system activities
- **RESTful API**: Clean, well-documented API endpoints for all operations

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google AI API Key (for Gemini AI classification)
- Firebase Project (optional, for persistent storage and authentication)
- Supabase Account (optional, for database storage)

## 🛠️ Installation

1. **Clone the repository**
```bash
git clone https://github.com/srikrishnadeveloper/whatsappautomationb.git
cd whatsappautomationb
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Copy the example environment file and fill in your values:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Server Configuration
PORT=8080
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Auto-start WhatsApp
AUTO_START_WHATSAPP=true

# Google AI (Gemini) - Required for AI classification
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# Supabase - Optional for database storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Classification Settings
AI_ENABLED=true
USE_RULES_FALLBACK=true
```

4. **Get API Keys**

- **Google AI API Key**: Get from [Google AI Studio](https://aistudio.google.com/app/apikey)
- **Supabase**: Create a project at [Supabase](https://supabase.com)
- **Firebase** (optional): Set up a project at [Firebase Console](https://console.firebase.google.com)

## 🏃 Running the Application

### Development Mode
```bash
npm run dev
```
Server will start at `http://localhost:8080` with hot-reload enabled.

### Production Build
```bash
npm run build
npm start
```

## 📡 API Endpoints

### Health & Status
- `GET /` - API information and available endpoints
- `GET /api/health` - Health check endpoint

### Authentication
- `POST /api/auth/login` - User login (Firebase)
- `POST /api/auth/register` - User registration (Firebase)
- `GET /api/auth/verify` - Verify authentication token

### WhatsApp Management
- `POST /api/whatsapp/start` - Start WhatsApp connection
- `POST /api/whatsapp/stop` - Stop WhatsApp connection
- `POST /api/whatsapp/logout` - Logout from WhatsApp
- `GET /api/whatsapp/status` - Get connection status
- `GET /api/whatsapp/qr` - Get QR code for authentication

### Messages
- `GET /api/messages` - List all messages
- `GET /api/messages/:id` - Get specific message
- `POST /api/messages` - Create new message
- `DELETE /api/messages/:id` - Delete message

### Classification
- `POST /api/classify` - Classify text message
  ```json
  {
    "text": "Can you send me the report by Friday?",
    "sender": "John Doe",
    "context": "work"
  }
  ```

### Action Items
- `GET /api/actions` - List all action items
- `GET /api/actions/:id` - Get specific action item
- `POST /api/actions` - Create action item
- `PUT /api/actions/:id` - Update action item
- `DELETE /api/actions/:id` - Delete action item

### Statistics
- `GET /api/stats` - Get system statistics
- `GET /api/stats/daily` - Daily statistics
- `GET /api/stats/categories` - Category breakdown

### Search
- `POST /api/search` - AI-powered semantic search
  ```json
  {
    "query": "project deadline discussions",
    "limit": 10
  }
  ```

### Activity Logs
- `GET /api/logs` - Get system activity logs

## 🏗️ Project Structure

```
whatsappautomationb/
├── src/
│   ├── index.ts                 # Application entry point
│   ├── middleware/              # Authentication & authorization
│   │   ├── auth.ts
│   │   └── auth-firebase.ts
│   ├── routes/                  # API route handlers
│   │   ├── action-items.ts
│   │   ├── action-items-firebase.ts
│   │   ├── action-items-hybrid.ts
│   │   ├── auth.ts
│   │   ├── auth-firebase.ts
│   │   ├── messages.ts
│   │   ├── messages-hybrid.ts
│   │   ├── stats.ts
│   │   ├── stats-hybrid.ts
│   │   └── whatsapp.ts
│   ├── services/                # Business logic
│   │   ├── ai-classifier.ts     # Gemini AI classification
│   │   ├── ai-search.ts         # AI-powered search
│   │   ├── action-items.ts      # Action item management
│   │   ├── message-store.ts     # Message storage (in-memory)
│   │   ├── firestore-message-store.ts  # Firestore storage
│   │   ├── hybrid-message-store.ts     # Hybrid storage with fallback
│   │   ├── whatsapp-integrated.ts      # WhatsApp integration
│   │   ├── activity-log.ts      # System logging
│   │   └── system-state.ts      # System state management
│   └── classifier/              # Classification logic
│       ├── ai-classifier.ts     # AI-based classifier
│       ├── rule-based.ts        # Rule-based fallback
│       ├── keywords.ts          # Keyword matching
│       └── deadline-parser.ts   # Deadline extraction
├── database/                    # Database migrations (if any)
├── .env.example                 # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## 🤖 AI Classification

The system uses Google's Gemini AI to classify messages with high accuracy. It analyzes:

1. **Message Content**: The actual text of the message
2. **Context**: Who sent it and conversation history
3. **Intent**: What the sender wants to achieve
4. **Urgency**: Time-sensitive keywords and phrases

### Classification Categories

- **Action Item**: Tasks, todos, requests requiring action
- **Question**: Queries needing responses
- **Information**: Updates, announcements, sharing information
- **Casual**: General conversation, greetings, small talk

### Fallback System

If AI classification is unavailable:
- Falls back to rule-based classification
- Uses keyword matching and pattern recognition
- Ensures the system continues functioning

## 🔒 Security Features

- **Helmet.js**: Security headers protection
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: Prevents API abuse (1000 req/min default)
- **Firebase Authentication**: Secure user management
- **Environment Variables**: Sensitive data protection
- **Request Validation**: Input sanitization

## 🔄 Storage Options

### In-Memory Storage
- Fast, zero-configuration
- Perfect for development
- Data lost on restart

### Firestore Storage
- Persistent cloud storage
- Automatic synchronization
- Requires Firebase setup

### Hybrid Storage
- Best of both worlds
- Automatic fallback to in-memory if Firebase unavailable
- Seamless transition

## 📊 Monitoring & Logging

The system includes comprehensive logging:

- **Activity Logs**: All system operations
- **Error Tracking**: Detailed error information
- **Performance Metrics**: Response times, throughput
- **Message Statistics**: Volume, categories, trends

Access logs via:
```bash
GET /api/logs
```

## 🚦 Getting Started Guide

1. **Start the server**
```bash
npm run dev
```

2. **Connect WhatsApp**
   - The server auto-starts WhatsApp if `AUTO_START_WHATSAPP=true`
   - Get QR code: `GET http://localhost:8080/api/whatsapp/qr`
   - Scan with WhatsApp mobile app

3. **Test classification**
```bash
curl -X POST http://localhost:8080/api/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "Please review the document by tomorrow"}'
```

4. **View statistics**
```bash
curl http://localhost:8080/api/stats
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🐛 Troubleshooting

### WhatsApp won't connect
- Check QR code is being generated
- Ensure no other WhatsApp Web sessions are active
- Verify network connectivity

### AI classification not working
- Verify `GOOGLE_AI_API_KEY` is set correctly
- Check API quota limits
- System will fall back to rule-based classification

### Database connection issues
- Verify Firebase/Supabase credentials
- Check network firewall settings
- System will fall back to in-memory storage

## 📧 Support

For issues and questions, please open an issue on the GitHub repository.

## 🙏 Acknowledgments

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [Google Generative AI](https://ai.google.dev/) - Gemini AI for classification
- [Firebase](https://firebase.google.com/) - Authentication and storage
- [Express.js](https://expressjs.com/) - Web framework

---

Made with ❤️ for efficient task management through WhatsApp
