# API Reference - Complete Endpoint Documentation
**WhatsApp Task Manager REST API**

Base URL: `http://localhost:3001` (development)

---

## 🔐 Authentication

All authenticated endpoints require the `Authorization` header:

```
Authorization: Bearer <firebase_token>
```

**How to get token:**
1. Call `POST /api/auth/login` or `POST /api/auth/register`
2. Save the returned `token`
3. Include in all subsequent requests

---

## 📋 Table of Contents

1. [Authentication Endpoints](#authentication-endpoints)
2. [WhatsApp Control Endpoints](#whatsapp-control-endpoints)
3. [Message Endpoints](#message-endpoints)
4. [Action Item Endpoints](#action-item-endpoints)
5. [Statistics Endpoints](#statistics-endpoints)
6. [Search Endpoints](#search-endpoints)
7. [Classification Endpoints](#classification-endpoints)
8. [Logs Endpoints](#logs-endpoints)
9. [Health Check](#health-check)

---

## Authentication Endpoints

### Register User

```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "fullName": "John Doe"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "firebase_uid_123",
      "email": "user@example.com",
      "fullName": "John Doe",
      "createdAt": "2026-02-21T10:30:00.000Z"
    },
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Email already exists"
}
```

---

### Login User

```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "firebase_uid_123",
      "email": "user@example.com",
      "fullName": "John Doe"
    },
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

### Get Current User

```http
GET /api/auth/user
```

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "firebase_uid_123",
    "email": "user@example.com",
    "fullName": "John Doe",
    "phone": "+1234567890",
    "createdAt": "2026-02-20T08:00:00.000Z"
  }
}
```

---

### Update User Profile

```http
PATCH /api/auth/user
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "fullName": "Jane Smith",
  "phone": "+9876543210"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "firebase_uid_123",
    "email": "user@example.com",
    "fullName": "Jane Smith",
    "phone": "+9876543210"
  }
}
```

---

### Logout

```http
POST /api/auth/logout
```

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## WhatsApp Control Endpoints

### Get WhatsApp Status

```http
GET /api/whatsapp/status
```

**No authentication required**

**Success Response (200):**
```json
{
  "isConnected": true,
  "phoneNumber": "+1234567890",
  "qrCode": null,
  "status": "connected",
  "error": null,
  "connectionTime": "2026-02-21T09:15:30.000Z",
  "lastMessageTime": "2026-02-21T10:45:12.000Z",
  "messageCount": 247
}
```

**Status values:**
- `"disconnected"` - Not connected
- `"connecting"` - Initiating connection
- `"connected"` - Fully connected
- `"error"` - Connection error

---

### Start WhatsApp Connection

```http
POST /api/whatsapp/start
```

**No authentication required** (⚠️ Should add auth in production)

**Success Response (200):**
```json
{
  "success": true,
  "message": "WhatsApp service starting"
}
```

**Side Effect:**
- If no saved session → generates QR code
- If saved session exists → auto-connects

---

### Stop WhatsApp Connection

```http
POST /api/whatsapp/stop
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "WhatsApp service stopped"
}
```

**Note:** Session is preserved, can reconnect without QR

---

### Logout WhatsApp (Clear Session)

```http
POST /api/whatsapp/logout
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "WhatsApp logged out and session cleared"
}
```

**Note:** Next connection will require QR scan

---

### Get QR Code (Text)

```http
GET /api/whatsapp/qr
```

**Success Response (200):**
```json
{
  "qrCode": "1@ABC123XYZ..."
}
```

**Response (404) if no QR available:**
```json
{
  "error": "No QR code available"
}
```

**Use case:** Display in terminal/CLI

---

### Get QR Code (Image)

```http
GET /api/whatsapp/qr-image
```

**Success Response (200):**
```json
{
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**Use case:** Display in browser with `<img src={qrImage} />`

---

### WhatsApp Status Stream (SSE)

```http
GET /api/whatsapp/events
```

**Server-Sent Events stream**

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event format:**
```
data: {"type":"status","data":{"isConnected":true,"status":"connected",...}}

data: {"type":"qr","data":{"qrCode":"1@ABC123..."}}

data: {"type":"message","data":{"sender":"Alice","content":"Hello"}}
```

**Client-side usage:**
```javascript
const eventSource = new EventSource('http://localhost:3001/api/whatsapp/events');

eventSource.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  
  if (type === 'status') {
    console.log('WhatsApp status:', data.status);
  } else if (type === 'qr') {
    console.log('New QR code:', data.qrCode);
  }
};
```

---

## Message Endpoints

### Get All Messages

```http
GET /api/messages
```

**Query Parameters:**
- `category` (optional) - Filter: `work`, `study`, `personal`, `ignore`
- `priority` (optional) - Filter: `urgent`, `high`, `medium`, `low`
- `decision` (optional) - Filter: `create`, `review`, `ignore`
- `limit` (optional) - Max results (default: 100)
- `userId` (optional) - Filter by user

**Example:**
```
GET /api/messages?category=work&priority=urgent&limit=20
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "msg_123",
      "user_id": "firebase_uid_123",
      "sender": "Alice",
      "content": "Can you review the report by EOD?",
      "chat_name": "Work Group",
      "timestamp": "2026-02-21T10:30:00.000Z",
      "classification": "work",
      "priority": "urgent",
      "decision": "create",
      "ai_reasoning": "Work-related task with EOD deadline",
      "confidence": 0.92,
      "notion_page_id": null,
      "created_at": "2026-02-21T10:30:05.000Z"
    }
  ]
}
```

---

### Get Single Message

```http
GET /api/messages/:id
```

**Example:**
```
GET /api/messages/msg_123
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "msg_123",
    "sender": "Alice",
    "content": "Can you review the report by EOD?",
    "classification": "work",
    "priority": "urgent",
    "decision": "create"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Message not found"
}
```

---

### Update Message

```http
PATCH /api/messages/:id
```

**Request Body:** (all fields optional)
```json
{
  "classification": "study",
  "priority": "high",
  "decision": "review",
  "ai_reasoning": "Updated reasoning"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "msg_123",
    "classification": "study",
    "priority": "high",
    "decision": "review"
  }
}
```

**Allowed fields:**
- `classification` (work|study|personal|ignore)
- `priority` (urgent|high|medium|low)
- `decision` (create|review|ignore)
- `ai_reasoning` (string)

---

### Delete Message

```http
DELETE /api/messages/:id
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Message deleted"
}
```

**Side Effect:** Also deletes linked action items

---

### Get Message Statistics

```http
GET /api/messages/stats
```

**Query Parameters:**
- `userId` (optional)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 247,
    "by_category": {
      "work": 105,
      "study": 68,
      "personal": 42,
      "ignore": 32
    },
    "by_priority": {
      "urgent": 15,
      "high": 67,
      "medium": 120,
      "low": 45
    },
    "by_decision": {
      "create": 89,
      "review": 73,
      "ignore": 85
    },
    "create_ratio": 0.36,
    "recent_messages": [...]
  }
}
```

---

## Action Item Endpoints

### Get All Action Items

```http
GET /api/actions
```

**Query Parameters:**
- `priority` (optional) - Filter: `urgent`, `high`, `medium`, `low`
- `status` (optional) - Filter: `pending`, `in_progress`, `completed`, `cancelled`
- `limit` (optional) - Max results
- `userId` (optional)

**Example:**
```
GET /api/actions?status=pending&priority=urgent
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "action_456",
      "user_id": "firebase_uid_123",
      "message_id": "msg_123",
      "title": "Review report",
      "description": "Review the quarterly report by end of day",
      "priority": "urgent",
      "status": "pending",
      "due_date": "2026-02-21T23:59:00.000Z",
      "task_type": "review",
      "confidence": 0.88,
      "created_at": "2026-02-21T10:30:05.000Z"
    }
  ]
}
```

**Status values:**
- `"pending"` - Not started
- `"in_progress"` - Currently working
- `"completed"` - Finished
- `"cancelled"` - No longer needed

**Task types:**
- `"task"` - Generic task
- `"reminder"` - Time-based reminder
- `"review"` - Review/approval needed
- `"meeting"` - Meeting/call
- `"deadline"` - Hard deadline

---

### Get Single Action Item

```http
GET /api/actions/:id
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "action_456",
    "title": "Review report",
    "description": "Review the quarterly report",
    "priority": "urgent",
    "status": "pending",
    "due_date": "2026-02-21T23:59:00.000Z"
  }
}
```

---

### Create Action Item

```http
POST /api/actions
```

**Request Body:**
```json
{
  "title": "Call dentist",
  "description": "Schedule appointment for teeth cleaning",
  "priority": "medium",
  "due_date": "2026-02-25T10:00:00.000Z",
  "task_type": "reminder",
  "message_id": "msg_789"
}
```

**Required fields:**
- `title` (string)

**Optional fields:**
- `description` (string)
- `priority` (urgent|high|medium|low) - default: "medium"
- `status` (pending|in_progress|completed|cancelled) - default: "pending"
- `due_date` (ISO date string)
- `task_type` (task|reminder|review|meeting|deadline)
- `message_id` (link to source message)
- `confidence` (number 0-1)

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "action_789",
    "title": "Call dentist",
    "description": "Schedule appointment for teeth cleaning",
    "priority": "medium",
    "status": "pending",
    "due_date": "2026-02-25T10:00:00.000Z",
    "created_at": "2026-02-21T11:00:00.000Z"
  }
}
```

---

### Update Action Item

```http
PATCH /api/actions/:id
```

**Request Body:** (all fields optional)
```json
{
  "status": "completed",
  "priority": "high",
  "due_date": "2026-02-22T15:00:00.000Z"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "action_456",
    "status": "completed",
    "updated_at": "2026-02-21T11:15:00.000Z"
  }
}
```

---

### Delete Action Item

```http
DELETE /api/actions/:id
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Action item deleted"
}
```

---

### Action Items Statistics

```http
GET /api/actions/stats
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 89,
    "by_priority": {
      "urgent": 5,
      "high": 22,
      "medium": 45,
      "low": 17
    },
    "by_status": {
      "pending": 34,
      "in_progress": 12,
      "completed": 38,
      "cancelled": 5
    },
    "by_task_type": {
      "task": 40,
      "reminder": 18,
      "review": 15,
      "meeting": 10,
      "deadline": 6
    },
    "overdue": 8,
    "due_today": 5,
    "due_this_week": 12
  }
}
```

---

### Action Items Stream (SSE)

```http
GET /api/actions/stream
```

**Server-Sent Events stream** for real-time updates

**Event types:**
```
data: {"type":"created","data":{...new action item}}

data: {"type":"updated","data":{...updated action item}}

data: {"type":"deleted","data":{"id":"action_456"}}
```

**Client-side usage:**
```javascript
const eventSource = new EventSource('http://localhost:3001/api/actions/stream');

eventSource.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  
  if (type === 'created') {
    // Add new action item to list
  } else if (type === 'updated') {
    // Update existing action item
  } else if (type === 'deleted') {
    // Remove action item from list
  }
};
```

---

## Statistics Endpoints

### Overall Statistics

```http
GET /api/stats
```

**Query Parameters:**
- `userId` (optional)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "messages": {
      "total": 247,
      "work": 105,
      "study": 68,
      "personal": 42,
      "ignore": 32
    },
    "action_items": {
      "total": 89,
      "pending": 34,
      "completed": 38
    },
    "create_ratio": 0.36,
    "classification_accuracy": 0.87
  }
}
```

---

### Timeline Statistics

```http
GET /api/stats/timeline
```

**Query Parameters:**
- `days` (optional) - Number of days to include (default: 7)

**Example:**
```
GET /api/stats/timeline?days=30
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-02-21",
      "message_count": 32,
      "action_items_created": 8,
      "work_messages": 15,
      "study_messages": 10,
      "personal_messages": 7
    },
    {
      "date": "2026-02-20",
      "message_count": 28,
      "action_items_created": 6,
      "work_messages": 12,
      "study_messages": 9,
      "personal_messages": 7
    }
  ]
}
```

---

### Top Senders

```http
GET /api/stats/top-senders
```

**Query Parameters:**
- `limit` (optional) - Number of senders (default: 10)

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "sender": "Alice",
      "message_count": 42,
      "work_messages": 28,
      "study_messages": 10,
      "personal_messages": 4
    },
    {
      "sender": "Bob",
      "message_count": 35,
      "work_messages": 2,
      "study_messages": 30,
      "personal_messages": 3
    }
  ]
}
```

---

### Dashboard Summary

```http
GET /api/stats/summary
```

**Quick overview for dashboard**

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "today": {
      "messages": 12,
      "action_items_created": 3
    },
    "totals": {
      "messages": 247,
      "action_items": 89,
      "pending_items": 34
    },
    "urgent_items": 5,
    "overdue_items": 3
  }
}
```

---

## Search Endpoints

### AI Search

```http
POST /api/search
```

**Semantic search using AI**

**Request Body:**
```json
{
  "query": "What did Alice say about the project deadline?",
  "userId": "firebase_uid_123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "answer": "Alice mentioned that the project deadline is February 25th at 5 PM. She emphasized the importance of completing the design phase by February 23rd.",
    "relevant_messages": [
      {
        "id": "msg_101",
        "sender": "Alice",
        "content": "Don't forget, project deadline is Feb 25 at 5 PM",
        "relevance_score": 0.95,
        "timestamp": "2026-02-20T14:30:00.000Z"
      },
      {
        "id": "msg_87",
        "sender": "Alice",
        "content": "We need to finish design by Feb 23",
        "relevance_score": 0.82,
        "timestamp": "2026-02-19T10:15:00.000Z"
      }
    ],
    "total_messages_searched": 247
  }
}
```

---

### Person-Based Search

```http
GET /api/search/person/:name
```

**Search all messages from/mentioning a person**

**Example:**
```
GET /api/search/person/Alice?userId=firebase_uid_123
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "person": "Alice",
    "summary": "Alice has been primarily discussing work-related topics, including project deadlines and team meetings. She mentioned an upcoming presentation on February 24th and requested document reviews.",
    "messages": [
      {
        "id": "msg_101",
        "sender": "Alice",
        "content": "Don't forget, project deadline is Feb 25",
        "timestamp": "2026-02-20T14:30:00.000Z"
      }
    ],
    "message_count": 42,
    "date_range": {
      "first_message": "2026-01-15T08:00:00.000Z",
      "last_message": "2026-02-21T09:45:00.000Z"
    }
  }
}
```

---

## Classification Endpoints

### Classify Single Message

```http
POST /api/classify
```

**Manually classify any text**

**Request Body:**
```json
{
  "content": "Need to submit assignment by Friday",
  "sender": "Professor Smith",
  "chat_name": "Computer Science Class"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "category": "study",
    "priority": "high",
    "decision": "create",
    "reasoning": "Assignment deadline mentioned with specific due date",
    "confidence": 0.91,
    "keywords_matched": ["submit", "assignment", "Friday"],
    "has_deadline": true,
    "has_action_verb": true,
    "action_items": [
      {
        "title": "Submit assignment",
        "description": "Submit assignment by Friday",
        "priority": "high",
        "due_date": "2026-02-25T23:59:00.000Z",
        "task_type": "deadline",
        "confidence": 0.88
      }
    ]
  }
}
```

---

### Classify Batch

```http
POST /api/classify/batch
```

**Classify multiple messages at once**

**Request Body:**
```json
{
  "messages": [
    {
      "content": "Meeting at 3 PM today",
      "sender": "Boss"
    },
    {
      "content": "Can we reschedule?",
      "sender": "Colleague"
    }
  ]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "category": "work",
      "priority": "urgent",
      "decision": "create",
      "confidence": 0.89
    },
    {
      "category": "work",
      "priority": "medium",
      "decision": "review",
      "confidence": 0.72
    }
  ]
}
```

---

## Logs Endpoints

### Get Recent Logs

```http
GET /api/logs
```

**Query Parameters:**
- `limit` (optional) - Max logs to return (default: 100)

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "log_123",
      "level": "info",
      "title": "WhatsApp Connected",
      "message": "Successfully connected to +1234567890",
      "timestamp": "2026-02-21T10:00:00.000Z"
    },
    {
      "id": "log_124",
      "level": "success",
      "title": "Message Classified",
      "message": "Classified message from Alice as work/urgent",
      "timestamp": "2026-02-21T10:30:00.000Z"
    }
  ]
}
```

**Log levels:**
- `"info"` - General information
- `"success"` - Successful operation
- `"warning"` - Warning/caution
- `"error"` - Error occurred

---

### Logs Stream (SSE)

```http
GET /api/logs/stream
```

**Server-Sent Events for real-time logs**

**Event format:**
```
data: {"level":"info","title":"New Message","message":"Message from Alice","timestamp":"2026-02-21T10:45:12.000Z"}

data: {"level":"success","title":"Task Created","message":"Created action item: Review report","timestamp":"2026-02-21T10:45:15.000Z"}
```

**Client-side usage:**
```javascript
const eventSource = new EventSource('http://localhost:3001/api/logs/stream');

eventSource.onmessage = (event) => {
  const logEntry = JSON.parse(event.data);
  console.log(`[${logEntry.level}] ${logEntry.title}: ${logEntry.message}`);
};
```

---

## Health Check

### System Health

```http
GET /api/health
```

**No authentication required**

**Success Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-21T11:00:00.000Z",
  "uptime": 3600,
  "database": {
    "firebase": "connected",
    "supabase": "connected",
    "fallback": "available"
  },
  "whatsapp": {
    "status": "connected",
    "phone": "+1234567890"
  },
  "memory": {
    "used": 120000000,
    "total": 512000000
  }
}
```

**Degraded Response (503):**
```json
{
  "status": "degraded",
  "timestamp": "2026-02-21T11:00:00.000Z",
  "database": {
    "firebase": "error",
    "fallback": "active"
  },
  "whatsapp": {
    "status": "disconnected"
  }
}
```

---

## Error Responses

### Standard Error Format

All errors follow this structure:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes

**400 Bad Request** - Invalid input
```json
{
  "success": false,
  "error": "Missing required field: title"
}
```

**401 Unauthorized** - Auth required or token invalid
```json
{
  "success": false,
  "error": "Authentication required"
}
```

**403 Forbidden** - Authenticated but not allowed
```json
{
  "success": false,
  "error": "You don't have permission to access this resource"
}
```

**404 Not Found** - Resource doesn't exist
```json
{
  "success": false,
  "error": "Message not found"
}
```

**429 Too Many Requests** - Rate limit exceeded
```json
{
  "success": false,
  "error": "Too many requests, please slow down"
}
```

**500 Internal Server Error** - Server error
```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Rate Limiting

**Default rate limit:** 1000 requests per minute per IP

**Headers included in responses:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 2026-02-21T10:05:00.000Z
```

**When rate-limited:**
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

---

## CORS Configuration

**Allowed origins:**
- `http://localhost:5173` (Vite dev)
- `http://localhost:3000` (React dev)
- Production domain (when deployed)

**Allowed methods:**
- GET, POST, PATCH, DELETE, OPTIONS

**Allowed headers:**
- Content-Type, Authorization

---

## Example: Complete Flow

### User Registration → Login → Fetch Messages

**Step 1: Register**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "secure123",
    "fullName": "John Doe"
  }'
```

**Step 2: Login** (or use token from registration)
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "secure123"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Step 3: Fetch Messages**
```bash
curl -X GET "http://localhost:3001/api/messages?category=work&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

**End of API Reference**
