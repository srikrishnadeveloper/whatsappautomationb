# Complete Setup Guide
**WhatsApp Task Manager - From Zero to Running**

---

## 📋 Prerequisites

Before starting, ensure you have:

✅ **Node.js 18+** installed
```bash
node --version  # Should be v18.0.0 or higher
```

✅ **npm** or **yarn** installed
```bash
npm --version
```

✅ **Git** installed (if cloning repository)

✅ **Google Chrome installed** (required by WhatsApp Baileys library)

✅ **Active WhatsApp account** with phone

---

## 📁 Project Structure

```
Whatsapp/
├── backend/           # Node.js Express API
│   ├── src/
│   ├── database/
│   ├── package.json
│   └── .env          # ← You'll create this
│
└── frontend/          # React Vite app
    └── frontend/
        ├── src/
        ├── package.json
        └── .env      # ← You'll create this
```

---

## 🔑 Required API Keys & Accounts

### 1. Google Gemini API (AI Classification)

**Get API key:**
1. Go to: https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key (starts with `AIza...`)

**Free tier:**
- 60 requests per minute
- 1500 requests per day
- Perfect for development

---

### 2. Firebase (Authentication & Database)

**Setup:**
1. Go to: https://console.firebase.google.com/
2. Click "Add project"
3. Enter project name (e.g., "whatsapp-task-manager")
4. Disable Google Analytics (optional)
5. Click "Create project"

**Enable Authentication:**
1. In Firebase console, go to "Authentication"
2. Click "Get started"
3. Click "Sign-in method" tab
4. Enable "Email/Password"
5. Click "Save"

**Create Firestore Database:**
1. Go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in production mode"
4. Select region (choose closest to you)
5. Click "Enable"

**Get Firebase credentials:**

**For Backend (Admin SDK):**
1. Go to Project Settings (gear icon)
2. Go to "Service accounts" tab
3. Click "Generate new private key"
4. Download JSON file
5. Open the file and copy:
   - `project_id`
   - `client_email`
   - `private_key`

**For Frontend (Web SDK):**
1. Go to Project Settings > General
2. Scroll to "Your apps"
3. Click web icon (</>) to add web app
4. Register app with a nickname
5. Copy the config object:
   ```javascript
   {
     apiKey: "AIzaSy...",
     authDomain: "project.firebaseapp.com",
     projectId: "project-id",
     storageBucket: "project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   }
   ```

---

### 3. Supabase (Optional Alternative Database)

**If you want to use Supabase instead of/alongside Firebase:**

1. Go to: https://supabase.com/
2. Click "Start your project"
3. Sign in with GitHub
4. Click "New project"
5. Enter details:
   - Name: whatsapp-task-manager
   - Database password: (create strong password)
   - Region: (closest to you)
6. Wait for project to initialize (~2 minutes)

**Get Supabase credentials:**
1. Go to Project Settings > API
2. Copy:
   - Project URL (e.g., `https://abc123.supabase.co`)
   - `anon` public key (starts with `eyJ...`)

**Create tables:**
1. Go to SQL Editor
2. Run the schema from `backend/database/schema.sql`

---

## 🚀 Backend Setup

### Step 1: Navigate to backend folder

```bash
cd backend
```

### Step 2: Install dependencies

```bash
npm install
```

**This installs:**
- Express (web server)
- Baileys (WhatsApp client)
- Firebase Admin SDK
- Google Generative AI (Gemini)
- And all other dependencies

**Installation time:** 2-3 minutes

### Step 3: Create environment file

Create a file named `.env` in the `backend/` folder:

```bash
# Windows (PowerShell)
New-Item .env -ItemType File

# Mac/Linux
touch .env
```

### Step 4: Configure environment variables

Open `backend/.env` and paste:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Google Gemini AI API
GOOGLE_AI_API_KEY=AIzaSy...your_key_here

# Firebase Admin (Backend)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc123@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"

# Supabase (Optional)
SUPABASE_URL=https://abc123.supabase.co
SUPABASE_ANON_KEY=eyJ...your_key_here

# WhatsApp Configuration
AUTO_START_WHATSAPP=false
WHATSAPP_SESSION_PATH=./session

# Storage Configuration
USE_FIREBASE=true
USE_SUPABASE=false
```

**⚠️ Important:**
- Replace ALL placeholder values with your actual credentials
- `FIREBASE_PRIVATE_KEY` must keep `\n` characters in quotes
- Set `AUTO_START_WHATSAPP=true` after first successful connection

### Step 5: Start backend server

```bash
npm run dev
```

**Expected output:**
```
🚀 Server starting...
✓ Environment variables loaded
✓ Middleware configured
✓ Routes mounted
✓ Server listening on http://localhost:3001
✓ Health check: http://localhost:3001/api/health
```

**Troubleshooting connection errors:**

If you see `ECONNREFUSED` errors:
- Firebase: Check credentials in `.env`
- Supabase: Check URL and key

If Firebase private key error:
- Ensure the key is wrapped in quotes
- Keep `\n` characters, don't replace them

**Server is ready when you see:** ✓ marks for all initialization steps

---

## 🎨 Frontend Setup

### Step 1: Navigate to frontend folder

**Open a NEW terminal** (keep backend running)

```bash
cd frontend/frontend
```

### Step 2: Install dependencies

```bash
npm install
```

**This installs:**
- React 18
- React Router
- Firebase Web SDK
- TailwindCSS
- Vite
- And all other dependencies

**Installation time:** 2-3 minutes

### Step 3: Create environment file

Create `.env` in `frontend/frontend/` folder:

```bash
# Windows (PowerShell)
New-Item .env -ItemType File

# Mac/Linux
touch .env
```

### Step 4: Configure environment variables

Open `frontend/frontend/.env` and paste:

```env
# Backend API
VITE_API_BASE_URL=http://localhost:3001

# Firebase Web SDK (Frontend)
VITE_FIREBASE_API_KEY=AIzaSy...your_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

**⚠️ Note:**
- These are DIFFERENT from backend Firebase credentials
- These come from Firebase Console > Project Settings > Web app config
- All variables MUST start with `VITE_` (Vite requirement)

### Step 5: Start frontend dev server

```bash
npm run dev
```

**Expected output:**
```
  VITE v5.0.0  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

**Frontend is ready when you see:** The Vite dev server URLs

### Step 6: Open in browser

Navigate to: **http://localhost:5173/**

**You should see:** The login page

---

## 📱 WhatsApp Connection

### Step 1: Start WhatsApp service

**Option A: Via API (Recommended)**

Open browser or use curl:
```bash
# Browser: Navigate to
http://localhost:3001/api/whatsapp/start

# Or use curl
curl -X POST http://localhost:3001/api/whatsapp/start
```

**Option B: Auto-start on server launch**

Set in `backend/.env`:
```env
AUTO_START_WHATSAPP=true
```
Restart backend server.

### Step 2: Get QR code

**Option A: In the app**
1. Go to http://localhost:5173/connect
2. Click "Connect WhatsApp"
3. QR code will appear

**Option B: Via API**
```bash
# Get QR code as image
curl http://localhost:3001/api/whatsapp/qr-image

# Response:
# { "image": "data:image/png;base64,..." }
```

### Step 3: Scan QR code

1. Open WhatsApp on your phone
2. Go to Settings > Linked Devices
3. Tap "Link a Device"
4. Scan the QR code from browser/terminal

**Scan window:** 60 seconds (QR expires after that)

### Step 4: Verify connection

**Check status:**
```bash
curl http://localhost:3001/api/whatsapp/status
```

**Expected response when connected:**
```json
{
  "isConnected": true,
  "phoneNumber": "+1234567890",
  "status": "connected",
  "connectionTime": "2026-02-21T10:00:00.000Z"
}
```

**In the app:**
- Navigate to /connect page
- Status should show "Connected"
- Your phone number should appear

### Step 5: Test message classification

Send yourself a WhatsApp message:
```
"Finish the report by tomorrow EOD"
```

**Check if it was classified:**
1. Go to http://localhost:5173/messages
2. You should see the message with:
   - Category: work
   - Priority: urgent/high
   - Decision: create

**Check backend logs:**
```
✓ Message received
✓ Classified as: work/urgent
✓ Action item created: Finish the report
```

---

## ✅ Verification Checklist

After setup, verify everything works:

### Backend Health Check

```bash
curl http://localhost:3001/api/health
```

**Should return:**
```json
{
  "status": "healthy",
  "uptime": 300,
  "database": "connected",
  "whatsapp": "connected"
}
```

### Frontend Pages Accessible

Visit each page:
- ✅ http://localhost:5173/ (redirects to /login if not logged in)
- ✅ http://localhost:5173/login
- ✅ http://localhost:5173/register
- ✅ http://localhost:5173/dashboard (after login)
- ✅ http://localhost:5173/messages
- ✅ http://localhost:5173/action-items
- ✅ http://localhost:5173/tasks
- ✅ http://localhost:5173/connect
- ✅ http://localhost:5173/settings

### Authentication Works

1. Go to /register
2. Create account: test@example.com / password123
3. Should redirect to /dashboard
4. Logout
5. Login again with same credentials
6. Should work

### WhatsApp Integration Works

1. Connect WhatsApp (see above)
2. Send yourself a test message
3. Check /messages page
4. Message should appear with classification

### AI Classification Works

Test manual classification:
```bash
curl -X POST http://localhost:3001/api/classify \
  -H "Content-Type: application/json" \
  -d '{"content": "Submit assignment by Friday"}'
```

**Should return:**
```json
{
  "category": "study",
  "priority": "high",
  "decision": "create",
  "confidence": 0.85
}
```

---

## 🐛 Troubleshooting

### Backend won't start

**Error:** `Cannot find module 'express'`
- **Fix:** Run `npm install` in backend folder

**Error:** `GOOGLE_AI_API_KEY is not defined`
- **Fix:** Check `.env` file exists and has the key

**Error:** `Firebase project not found`
- **Fix:** Verify Firebase credentials in `.env`

### Frontend won't start

**Error:** `Cannot find module 'react'`
- **Fix:** Run `npm install` in frontend/frontend folder

**Error:** `VITE_API_BASE_URL is not defined`
- **Fix:** Check frontend `.env` file

**Blank page after login**
- **Fix:** Check browser console for errors
- **Fix:** Verify backend is running on 3001

### WhatsApp won't connect

**Error:** `QR code not appearing`
- **Fix:** Ensure backend is running
- **Fix:** Call /api/whatsapp/start first

**Error:** `Connection closed`
- **Fix:** Check internet connection
- **Fix:** Try clearing session: `rm -rf backend/_IGNORE_session`
- **Fix:** Scan QR code within 60 seconds

**Error:** `Multi-device not enabled`
- **Fix:** Update WhatsApp app on phone
- **Fix:** Enable multi-device in WhatsApp settings

### Messages not being classified

**Error:** Messages received but not stored
- **Fix:** Check Firebase/Supabase connection in backend logs
- **Fix:** Verify database credentials

**Error:** Classification shows low confidence
- **Fix:** This is normal for ambiguous messages
- **Fix:** Manual review/reclassification available in UI

**Error:** `Gemini API quota exceeded`
- **Fix:** Wait for quota reset (per minute/day)
- **Fix:** Falls back to keyword-based classification

---

## 📊 Database Setup (Detailed)

### Option 1: Firebase Firestore

**No schema needed** - Firestore is schemaless

**Collections auto-created when first document added:**
- `users` - User profiles
- `messages` - WhatsApp messages
- `action_items` - Extracted tasks

**Note:** Documents automatically get a unique ID

### Option 2: Supabase PostgreSQL

**Run the schema:**

1. Go to Supabase Dashboard
2. Open SQL Editor
3. Copy contents of `backend/database/schema.sql`
4. Paste and run

**This creates:**
- `profiles` table
- `messages` table
- `tasks` table
- `rules` table
- `feedback` table

**To verify tables created:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```

### Option 3: In-Memory (No Database)

**Set in backend `.env`:**
```env
USE_FIREBASE=false
USE_SUPABASE=false
```

**Pros:**
- No external dependencies
- Instant setup
- Perfect for testing

**Cons:**
- Data lost on server restart
- No persistent storage
- Not suitable for production

---

## 🔄 Workflow After Setup

### Daily use:

**1. Start servers:**
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend/frontend
npm run dev
```

**2. Connect WhatsApp** (if not auto-connected)

**3. Use the app:**
- Messages auto-classify as they arrive
- View in /messages page
- Action items auto-created in /action-items
- Search messages with AI in /messages

**4. Stop servers when done:**
- Press `Ctrl+C` in each terminal

### Session persistence:

- WhatsApp session saved in `backend/_IGNORE_session/`
- No need to scan QR every time
- Delete this folder to force new QR scan

---

## 🚢 Production Deployment

### Backend Deployment (Render/Railway/Heroku)

**Environment variables to set:**
```
NODE_ENV=production
PORT=3001
GOOGLE_AI_API_KEY=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
AUTO_START_WHATSAPP=false
```

**⚠️ Important:**
- Keep `AUTO_START_WHATSAPP=false` in production
- Start WhatsApp manually after verifying server is stable
- Use persistent storage for session data

**Build command:**
```bash
npm run build
```

**Start command:**
```bash
npm start
```

### Frontend Deployment (Vercel/Netlify)

**Environment variables to set:**
```
VITE_API_BASE_URL=https://your-backend.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

**Build command:**
```bash
npm run build
```

**Output directory:**
```
dist/
```

**Note:** Using `vercel.json` in frontend folder for SPA routing

---

## 📚 Next Steps

After successful setup:

1. **Customize AI prompts** - Edit `backend/src/classifier/ai-classifier.ts`
2. **Add keywords** - Edit `backend/src/classifier/keywords.ts`
3. **Modify UI** - Edit files in `frontend/frontend/src/pages/`
4. **Add new routes** - Create in `backend/src/routes/` and mount in `index.ts`
5. **Integrate Notion** - Use `notion_page_id` field in messages

---

## 🆘 Getting Help

**Check logs:**
```bash
# Backend logs (in terminal where backend is running)
# Watch for errors starting with ✕ or ⚠

# Browser console (press F12)
# Check Console tab for frontend errors
```

**Common issues documented:**
- See TROUBLESHOOTING section above
- Check GitHub Issues (if using a repository)

**Verification commands:**
```bash
# Check if ports are in use
netstat -ano | findstr :3001  # Windows
lsof -i :3001                 # Mac/Linux

# Test API directly
curl http://localhost:3001/api/health
```

---

**Setup Complete! 🎉**

You now have a fully functional WhatsApp Task Manager with:
- ✅ WhatsApp message monitoring
- ✅ AI-powered classification
- ✅ Automatic action item extraction
- ✅ Web dashboard
- ✅ Real-time updates
- ✅ Persistent storage

Send yourself a WhatsApp message to see it in action!
