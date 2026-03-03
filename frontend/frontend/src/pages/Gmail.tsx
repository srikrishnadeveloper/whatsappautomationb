/**
 * Gmail Page - Real-Time Email Classification & Management
 * Shows synced Gmail messages classified by AI with real-time polling.
 * Auto-syncs on connect and polls for new emails every 60 seconds.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { 
  Mail, 
  RefreshCw, 
  Loader2, 
  AlertCircle,
  Inbox,
  Star,
  Tag,
  Trash2,
  ChevronDown,
  Paperclip,
  Unplug,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react'
import { API_BASE, authFetch } from '../services/api'
import { useAuth, readCachedGmailTokens } from '../context/AuthContext'

interface GmailMessage {
  id: string
  gmail_id: string
  from_email: string
  from_name: string
  to_email: string
  subject: string
  snippet: string
  body_text: string
  labels: string[]
  gmail_timestamp: string
  is_read: boolean
  has_attachments: boolean
  classification: string | null
  decision: string | null
  priority: string | null
}

interface GmailStatus {
  connected: boolean
  email: string | null
  lastSyncAt: string | null
  totalSynced: number
  syncEnabled: boolean
}

interface GmailStats {
  total: number
  by_classification: Record<string, number>
  by_decision: Record<string, number>
  by_priority: Record<string, number>
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const CATEGORY_COLORS: Record<string, string> = {
  work: 'bg-blue-50 text-blue-600 border-blue-200',
  study: 'bg-purple-50 text-purple-600 border-purple-200',
  personal: 'bg-green-50 text-green-600 border-green-200',
  urgent: 'bg-red-50 text-red-600 border-red-200',
  ignore: 'bg-gray-50 text-gray-500 border-gray-200',
}

export default function Gmail() {
  const { loginWithGoogle, user, session } = useAuth()
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [stats, setStats] = useState<GmailStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [autoConnecting, setAutoConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{synced: number; classified: number} | null>(null)
  const [lastPoll, setLastPoll] = useState<Date | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
  const POLL_INTERVAL = 60_000 // 60 seconds

  const fetchStatus = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/gmail/status`)
      const json = await res.json()
      if (json.success) setStatus(json.data)
    } catch (err) {
      console.error('Gmail status error:', err)
    }
  }, [])

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        if (['work', 'study', 'personal', 'urgent', 'ignore'].includes(filter)) {
          params.set('classification', filter)
        } else if (filter === 'actionable') {
          params.set('decision', 'create')
        }
      }
      params.set('limit', '50')

      const res = await authFetch(`${API_BASE}/gmail/messages?${params}`)
      const json = await res.json()
      if (json.success) setMessages(json.data || [])
    } catch (err) {
      console.error('Gmail messages error:', err)
    }
  }, [filter])

  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/gmail/stats`)
      const json = await res.json()
      if (json.success) setStats(json.data)
    } catch (err) {
      console.error('Gmail stats error:', err)
    }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    await Promise.all([fetchStatus(), fetchMessages(), fetchStats()])
    setLoading(false)
  }, [fetchStatus, fetchMessages, fetchStats])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { fetchMessages() }, [filter, fetchMessages])

  // ── Real-time polling: check for new emails every 60 seconds ────────────
  const pollForNewEmails = useCallback(async () => {
    if (!status?.connected) return
    setIsPolling(true)
    try {
      const res = await authFetch(`${API_BASE}/gmail/check-new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (json.success && json.data?.synced > 0) {
        // New emails found — refresh the list
        console.log(`📧 Polled: ${json.data.synced} new emails`)
        await Promise.all([fetchMessages(), fetchStats(), fetchStatus()])
        setSyncResult(json.data)
        // Auto-clear the sync result after 5 seconds
        setTimeout(() => setSyncResult(null), 5000)
      }
      setLastPoll(new Date())
    } catch (err) {
      console.error('Gmail poll error:', err)
    } finally {
      setIsPolling(false)
    }
  }, [status?.connected, fetchMessages, fetchStats, fetchStatus])

  // Start/stop polling when connection status changes
  useEffect(() => {
    if (status?.connected) {
      // Start polling
      pollTimerRef.current = setInterval(pollForNewEmails, POLL_INTERVAL)
      return () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
      }
    } else {
      // Stop polling
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [status?.connected, pollForNewEmails])

  // ── Auto-connect: try localStorage-cached Google tokens before showing the
  // "Connect Gmail" button.  This runs whenever the status loads as disconnected.
  useEffect(() => {
    if (loading) return
    if (status?.connected) return
    if (!user || !session?.access_token) return

    const cached = readCachedGmailTokens(user.id)
    if (!cached) return

    let cancelled = false
    const tryAutoConnect = async () => {
      setAutoConnecting(true)
      try {
        const res = await authFetch(`${API_BASE}/gmail/save-tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: cached.accessToken,
            refreshToken: cached.refreshToken,
            googleEmail: cached.googleEmail,
            expiresIn: 3600,
          }),
        })
        if (!cancelled && res.ok) {
          // Tokens saved — backend auto-triggers sync
          await fetchStatus()
          // Give backend 3s to finish initial sync then refresh messages
          setTimeout(async () => {
            if (!cancelled) {
              await Promise.all([fetchMessages(), fetchStats(), fetchStatus()])
            }
          }, 3000)
        }
      } catch { /* backend offline — user will see the Connect button */ }
      if (!cancelled) setAutoConnecting(false)
    }
    tryAutoConnect()
    return () => { cancelled = true }
  }, [loading, status?.connected, user, session, fetchStatus, fetchMessages, fetchStats])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const res = await authFetch(`${API_BASE}/gmail/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMessages: 50 })
      })
      const json = await res.json()
      if (json.success) {
        setSyncResult(json.data)
        setLastPoll(new Date())
        await Promise.all([fetchMessages(), fetchStats(), fetchStatus()])
        // Auto-clear sync result after 8 seconds
        setTimeout(() => setSyncResult(null), 8000)
      } else if (json.reconnect || res.status === 401) {
        // Token expired — try to refresh silently via cached tokens
        if (user && session?.access_token) {
          const cached = readCachedGmailTokens(user.id)
          if (cached) {
            try {
              const saveRes = await authFetch(`${API_BASE}/gmail/save-tokens`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  accessToken: cached.accessToken,
                  refreshToken: cached.refreshToken,
                  googleEmail: cached.googleEmail,
                  expiresIn: 3600,
                }),
              })
              if (saveRes.ok) {
                // Tokens refreshed — retry sync
                const retryRes = await authFetch(`${API_BASE}/gmail/sync`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ maxMessages: 50 })
                })
                const retryJson = await retryRes.json()
                if (retryJson.success) {
                  setSyncResult(retryJson.data)
                  setLastPoll(new Date())
                  await Promise.all([fetchMessages(), fetchStats(), fetchStatus()])
                  setTimeout(() => setSyncResult(null), 8000)
                  setSyncing(false)
                  return
                }
              }
            } catch { /* silent fail */ }
          }
        }
        // Could not auto-fix — show as disconnected
        setError('Gmail token expired. Please reconnect with Google.')
        setStatus(prev => prev ? { ...prev, connected: false } : null)
      } else {
        setError(json.message || 'Sync failed')
      }
    } catch (err: any) {
      setError(err.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      // Step 1: try re-saving any cached tokens (avoids full OAuth redirect)
      if (user && session?.access_token) {
        const cached = readCachedGmailTokens(user.id)
        if (cached) {
          const res = await authFetch(`${API_BASE}/gmail/save-tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: cached.accessToken,
              refreshToken: cached.refreshToken,
              googleEmail: cached.googleEmail,
              expiresIn: 3600,
            }),
          })
          if (res.ok) {
            // Backend will auto-trigger initial sync
            await fetchStatus()
            // Wait a moment for the background sync to complete, then fetch messages
            setTimeout(async () => {
              await Promise.all([fetchMessages(), fetchStats(), fetchStatus()])
            }, 3000)
            setConnecting(false)
            return
          }
        }
      }
      // Step 2: no cached tokens → full Google OAuth re-auth (asks for consent)
      await loginWithGoogle()
    } catch (err: any) {
      setError(err.message || 'Failed to connect Gmail')
    }
    setTimeout(() => setConnecting(false), 5000)
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Gmail? This will remove your stored tokens and synced messages.')) return
    try {
      await authFetch(`${API_BASE}/gmail/disconnect`, { method: 'POST' })
      await authFetch(`${API_BASE}/gmail/messages`, { method: 'DELETE' })
      setStatus(null)
      setMessages([])
      setStats(null)
      await fetchStatus()
    } catch (err) {
      console.error('Disconnect error:', err)
    }
  }

  const handleClearMessages = async () => {
    if (!confirm('Clear all synced emails? They will be re-synced on next sync.')) return
    try {
      await authFetch(`${API_BASE}/gmail/messages`, { method: 'DELETE' })
      setMessages([])
      setStats(null)
      await fetchStats()
    } catch (err) {
      console.error('Clear error:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 text-[var(--text-muted)] animate-spin" />
      </div>
    )
  }

  // Not connected state
  if (!status?.connected) {
    // If we have cached tokens and are trying to auto-connect, show a spinner
    if (autoConnecting) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
          <Loader2 className="w-8 h-8 text-[var(--text-muted)] animate-spin mb-4" />
          <p className="text-sm text-[var(--text-secondary)]">Reconnecting Gmail...</p>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center mb-6 shadow-soft">
          <Mail className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Connect Gmail</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-sm">
          Sign in with Google to let Mindline classify your emails, extract tasks, and keep you organized.
        </p>
        {error && (
          <p className="text-xs text-red-500 mb-4 max-w-xs">{error}</p>
        )}
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="inline-flex items-center gap-3 px-6 py-3 bg-white dark:bg-gray-800 border border-[var(--border-color)] rounded-lg font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {connecting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {connecting ? 'Connecting...' : 'Connect with Google'}
        </button>
        <p className="text-xs text-[var(--text-muted)] mt-4 max-w-xs">
          We request read-only access to your Gmail. Your data stays private.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Gmail</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {status.email && <span>{status.email} &middot; </span>}
            {stats?.total || 0} emails synced
            {lastPoll && (
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                &middot; Last checked: {lastPoll.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <div className="flex items-center gap-1 text-xs text-emerald-500" title="Auto-checking for new emails every 60s">
            {isPolling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Wifi className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">Live</span>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-primary inline-flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={handleDisconnect}
            className="p-2 text-[var(--text-muted)] hover:text-red-500 rounded-lg transition-colors"
            title="Disconnect Gmail"
          >
            <Unplug className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sync result toast */}
      {syncResult && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 dark:text-emerald-400">
          Synced {syncResult.synced} new emails, classified {syncResult.classified}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Stats Cards */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="soft-card p-3">
            <p className="text-xs text-[var(--text-muted)] mb-1">Total</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">{stats.total}</p>
          </div>
          <div className="soft-card p-3">
            <p className="text-xs text-[var(--text-muted)] mb-1">Actionable</p>
            <p className="text-lg font-semibold text-blue-600">{stats.by_decision?.create || 0}</p>
          </div>
          <div className="soft-card p-3">
            <p className="text-xs text-[var(--text-muted)] mb-1">Work</p>
            <p className="text-lg font-semibold text-indigo-600">{stats.by_classification?.work || 0}</p>
          </div>
          <div className="soft-card p-3">
            <p className="text-xs text-[var(--text-muted)] mb-1">Last Sync</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'All', icon: Inbox },
          { key: 'actionable', label: 'Actionable', icon: Star },
          { key: 'work', label: 'Work', icon: Tag },
          { key: 'study', label: 'Study', icon: Tag },
          { key: 'personal', label: 'Personal', icon: Tag },
          { key: 'ignore', label: 'Ignored', icon: Tag },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filter === f.key
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-surface-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <f.icon className="w-3.5 h-3.5" />
            {f.label}
          </button>
        ))}
      </div>

      {/* Messages List */}
      {messages.length === 0 ? (
        <div className="text-center py-12">
          <Mail className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
          <p className="text-sm text-[var(--text-muted)]">
            {filter === 'all' ? 'No emails synced yet. Click Sync to fetch your latest emails.' : `No ${filter} emails found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`soft-card overflow-hidden transition-all ${
                expandedId === msg.id ? 'ring-1 ring-[var(--accent-primary)]' : ''
              }`}
            >
              {/* Message Row */}
              <button
                onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--bg-surface-soft)] transition-colors"
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-[var(--bg-surface-soft)] flex items-center justify-center shrink-0">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    {(msg.from_name || msg.from_email || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm truncate ${msg.is_read ? 'text-[var(--text-secondary)]' : 'font-semibold text-[var(--text-primary)]'}`}>
                      {msg.from_name || msg.from_email}
                    </p>
                    {msg.has_attachments && <Paperclip className="w-3 h-3 text-[var(--text-muted)] shrink-0" />}
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0 ml-auto">
                      {new Date(msg.gmail_timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className={`text-sm truncate ${msg.is_read ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                    {msg.subject || '(no subject)'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{msg.snippet}</p>
                </div>

                {/* Tags */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {msg.classification && msg.classification !== 'ignore' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[msg.classification] || CATEGORY_COLORS.personal}`}>
                      {msg.classification}
                    </span>
                  )}
                  {msg.priority && msg.priority !== 'low' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[msg.priority] || PRIORITY_COLORS.low}`}>
                      {msg.priority}
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${expandedId === msg.id ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Expanded Content */}
              {expandedId === msg.id && (
                <div className="px-4 pb-4 border-t border-[var(--border-subtle)]">
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>From: {msg.from_name} &lt;{msg.from_email}&gt;</span>
                      <span>&middot;</span>
                      <span>{new Date(msg.gmail_timestamp).toLocaleString()}</span>
                    </div>
                    {msg.to_email && (
                      <div className="text-xs text-[var(--text-muted)]">
                        To: {msg.to_email}
                      </div>
                    )}
                    <div className="mt-3 p-3 bg-[var(--bg-surface-soft)] rounded-lg">
                      <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                        {msg.body_text?.slice(0, 1000) || msg.snippet || 'No content available'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {msg.decision === 'create' && (
                        <span className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                          Actionable
                        </span>
                      )}
                      {msg.labels?.map((label, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-soft)] text-[var(--text-muted)]">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer Actions */}
      {status?.connected && (
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)]">
            {status.totalSynced} total emails synced &middot;{' '}
            {status.lastSyncAt ? `Last sync: ${new Date(status.lastSyncAt).toLocaleString()}` : 'Never synced'}
          </p>
          <button
            onClick={handleClearMessages}
            className="text-xs text-[var(--text-muted)] hover:text-red-500 flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear synced emails
          </button>
        </div>
      )}
    </div>
  )
}
