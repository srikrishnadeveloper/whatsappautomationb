/**
 * browserLogger — mirrors every backend console log into the browser DevTools console.
 * Connects to /api/whatsapp/logs (SSE) and prints each line with a coloured prefix.
 * Open DevTools → Console to see the full live pipeline output.
 */

import { API_BASE, getAccessToken } from './api';

const PREFIX = '%c[SERVER]';
const STYLE  = 'color:#22d3ee;font-weight:bold;font-family:monospace';

let es: EventSource | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  if (es) return;                       // already connected

  const token = getAccessToken();
  const sep   = API_BASE.includes('?') ? '&' : '?';
  const url   = `${API_BASE}/whatsapp/logs${token ? `${sep}token=${encodeURIComponent(token)}` : ''}`;

  es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      const { line } = JSON.parse(e.data) as { line: string };
      if (!line || line.trim() === '') return;
      // Print each non-empty text line individually
      line.split('\n').forEach(l => {
        const t = l.trimEnd();
        if (t) console.log(PREFIX, STYLE, t);
      });
    } catch { /* ignore parse errors */ }
  };

  es.onerror = () => {
    es?.close();
    es = null;
    // Reconnect after 5 s
    if (!retryTimer) {
      retryTimer = setTimeout(() => { retryTimer = null; connect(); }, 5000);
    }
  };

  console.log(PREFIX, STYLE, '── browser log stream connected ──');
}

/** Call once at app start (after the user is authenticated). */
export function startBrowserLogger() {
  connect();
}

/** Tear down the stream (e.g. on logout). */
export function stopBrowserLogger() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  es?.close();
  es = null;
}
