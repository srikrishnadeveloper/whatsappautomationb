// Use absolute URL for production, relative for development
// Production URL must include /api prefix to match backend routing
const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api`
  : (import.meta.env.PROD ? 'https://whatsappautomationb.onrender.com/api' : '/api');

const AUTH_STORAGE_KEY = 'whatsapp_task_manager_auth';

// Export API_BASE for use in other components
export { API_BASE };

// Get auth token from localStorage (Supabase session format)
function getAuthHeaders(): Record<string, string> {
  const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!storedAuth) return {};
  
  try {
    const parsed = JSON.parse(storedAuth);
    // Supabase stores session with access_token at top level or nested
    const accessToken = parsed?.access_token || parsed?.session?.access_token;
    if (accessToken) {
      return { 'Authorization': `Bearer ${accessToken}` };
    }
    return {};
  } catch {
    return {};
  }
}

// Get the current access token (for SSE query params)
export function getAccessToken(): string | null {
  const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!storedAuth) return null;
  try {
    const parsed = JSON.parse(storedAuth);
    return parsed?.access_token || parsed?.session?.access_token || null;
  } catch {
    return null;
  }
}

// Helper for authenticated fetch
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers = {
    ...authHeaders,       // default auth headers first
    ...options.headers,   // explicit headers override (e.g. fresh token after OAuth)
  };
  return fetch(url, { ...options, headers });
}

// Helper to create SSE URL with auth token in query param
export function authSSEUrl(url: string): string {
  const token = getAccessToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

export interface Message {
  id: string;
  sender: string;
  chat_name: string | null;
  timestamp: string;
  content: string;
  message_type: string;
  classification: string | null;
  decision: string | null;
  priority: string | null;
  ai_reasoning: string | null;
  created_at: string;
}

export interface Stats {
  overview: {
    total_messages: number;
    recent_24h: number;
    tasks_created: number;
    pending_review: number;
  };
  by_classification: Record<string, number>;
  by_decision: Record<string, number>;
  by_priority: Record<string, number>;
}

export interface ClassificationResult {
  category: string;
  priority: string;
  confidence: number;
  keywords_matched: string[];
  has_deadline: boolean;
  decision: string;
}

// Messages API
export async function getMessages(params?: {
  classification?: string;
  decision?: string;
  priority?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Message[]; pagination: { total: number; hasMore: boolean }; mock?: boolean }> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    });
  }
  
  const res = await authFetch(`${API_BASE}/messages?${searchParams}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json;
}

export async function getMessage(id: string): Promise<Message> {
  const res = await authFetch(`${API_BASE}/messages/${id}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function updateMessage(id: string, updates: Partial<Message>): Promise<Message> {
  const res = await authFetch(`${API_BASE}/messages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function deleteMessage(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/messages/${id}`, {
    method: 'DELETE'
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

// Stats API
export async function getStats(): Promise<Stats> {
  const res = await authFetch(`${API_BASE}/stats`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// Classification API
export async function classifyText(content: string): Promise<ClassificationResult> {
  const res = await authFetch(`${API_BASE}/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.classification;
}

// Health API
export async function checkHealth(): Promise<{
  status: string;
  services: { api: string; supabase: string; gemini: string };
}> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

// WhatsApp Connection API
export interface WhatsAppState {
  status: 'disconnected' | 'qr_ready' | 'connecting' | 'connected' | 'error';
  qrCode: string | null;
  user: {
    name: string;
    phone: string;
  } | null;
  lastUpdate: string;
  error: string | null;
  messagesProcessed: number;
}

export async function getWhatsAppStatus(): Promise<WhatsAppState> {
  const res = await authFetch(`${API_BASE}/whatsapp/status`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function getWhatsAppQR(): Promise<{
  status: string;
  qrCode?: string;
  user?: { name: string; phone: string };
  message: string;
}> {
  const res = await authFetch(`${API_BASE}/whatsapp/qr`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function disconnectWhatsApp(): Promise<void> {
  const res = await authFetch(`${API_BASE}/whatsapp/disconnect`, {
    method: 'POST'
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}
