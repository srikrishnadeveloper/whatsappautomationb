import { useEffect, useState, useCallback } from 'react'
import { 
  RefreshCw,
  Trash2,
  Loader2,
  Shield,
  Plus,
  X,
  LogOut,
  Zap
} from 'lucide-react'
import clsx from 'clsx'
import { API_BASE, authFetch } from '../services/api'
import { useAuth } from '../context/AuthContext'

interface HealthStatus {
  status: string
  timestamp: string
  services: {
    supabase: boolean
    gemini: boolean
    whatsapp: string
  }
}

interface WhatsAppState {
  status: string
  user: { name: string; phone: string } | null
}

interface BlockedSender {
  jid: string
  display_name: string | null
  type: string
}

export default function Settings() {
  const { logout } = useAuth()
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [whatsappState, setWhatsappState] = useState<WhatsAppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  // Privacy state
  const [blockedSenders, setBlockedSenders] = useState<BlockedSender[]>([])
  const [newJid, setNewJid] = useState('')
  const [newName, setNewName] = useState('')
  const [privacyLoading, setPrivacyLoading] = useState(false)

  // ── Privacy helpers ────────────────────────────────────────────────────────
  const fetchBlockedSenders = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/privacy/blocked`)
      if (res.ok) setBlockedSenders((await res.json()).data ?? [])
    } catch { /* ignore */ }
  }, [])

  const addBlockedSender = async () => {
    const jid = newJid.trim()
    if (!jid) return
    setPrivacyLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/privacy/blocked`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid, display_name: newName.trim() || undefined }),
      })
      if (res.ok) {
        setNewJid('')
        setNewName('')
        await fetchBlockedSenders()
      }
    } finally {
      setPrivacyLoading(false)
    }
  }

  const removeBlockedSender = async (jid: string) => {
    setPrivacyLoading(true)
    try {
      await authFetch(`${API_BASE}/privacy/blocked/${encodeURIComponent(jid)}`, { method: 'DELETE' })
      await fetchBlockedSenders()
    } finally {
      setPrivacyLoading(false)
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/health`)
      const json = await res.json()
      setHealth(json)
    } catch (err) {
      console.error('Failed to fetch health:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch WhatsApp status separately for accurate connection status
  const fetchWhatsAppStatus = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/whatsapp/status`)
      const json = await res.json()
      if (json.success) {
        setWhatsappState(json.data)
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp status:', err)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    fetchWhatsAppStatus()
    fetchBlockedSenders()
    
    // Poll WhatsApp status every 5 seconds
    const interval = setInterval(fetchWhatsAppStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchHealth, fetchWhatsAppStatus, fetchBlockedSenders])

  const clearAllData = async () => {
    if (!confirm('Are you sure you want to clear all messages and tasks? This cannot be undone.')) return
    
    setClearing(true)
    try {
      await authFetch(`${API_BASE}/logs`, { method: 'DELETE' })
      await authFetch(`${API_BASE}/messages/clear`, { method: 'DELETE' })
      await authFetch(`${API_BASE}/actions/clear`, { method: 'DELETE' })
      alert('All data cleared successfully!')
    } catch (err) {
      console.error('Failed to clear data:', err)
      alert('Failed to clear some data. Check console for details.')
    } finally {
      setClearing(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await logout()
    } catch (e) {
      console.error('Sign out error:', e)
    } finally {
      setSigningOut(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Delete your account permanently? All data (messages, tasks, history) will be erased. This cannot be undone.')) return
    if (!confirm('Are you absolutely sure? This is irreversible.')) return
    setDeletingAccount(true)
    try {
      await authFetch(`${API_BASE}/auth/account`, { method: 'DELETE' })
      await logout()
    } catch (e: any) {
      console.error('Delete account error:', e)
      alert('Failed to delete account: ' + e.message)
    } finally {
      setDeletingAccount(false)
    }
  }

  // Use whatsappState for accurate connection status
  const isWhatsAppConnected = whatsappState?.status === 'connected'

  return (
    <div className="max-w-xl mx-auto overflow-hidden pb-10 px-4">
      {/* Header */}
      <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Settings</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6 sm:mb-8">Manage your preferences</p>

      {/* Connection Status */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Status</h2>
          <button 
            onClick={() => { fetchHealth(); fetchWhatsAppStatus(); }}
            className="p-1 rounded hover:bg-[var(--bg-hover)]"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5 text-[var(--text-muted)]', loading && 'animate-spin')} />
          </button>
        </div>
        
        <div className="text-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className={clsx(
              'w-2 h-2 rounded-full',
              isWhatsAppConnected ? 'bg-green-500' : 'bg-gray-400'
            )} />
            <span className="text-[var(--text-primary)]">WhatsApp</span>
            <span className="text-[var(--text-muted)]">
              {isWhatsAppConnected ? 'Connected' : 'Disconnected'}
            </span>
            {whatsappState?.user && (
              <span className="text-[var(--text-muted)] text-xs">({whatsappState.user.phone})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx(
              'w-2 h-2 rounded-full',
              health?.services.gemini ? 'bg-green-500' : 'bg-gray-400'
            )} />
            <span className="text-[var(--text-primary)]">AI (Gemini)</span>
            <span className="text-[var(--text-muted)]">
              {health?.services.gemini ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx(
              'w-2 h-2 rounded-full',
              health?.services.supabase ? 'bg-green-500' : 'bg-gray-400'
            )} />
            <span className="text-[var(--text-primary)]">Database</span>
            <span className="text-[var(--text-muted)]">
              {health?.services.supabase ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* AI Status */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-3">AI Classification</h2>
        <div className="flex items-center gap-2 py-2 px-3 bg-[var(--bg-surface-soft)] rounded-lg">
          <Zap className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
          <div>
            <p className="text-sm text-[var(--text-primary)]">AI always enabled</p>
            <p className="text-xs text-[var(--text-muted)]">Gemini AI classifies every message automatically</p>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Privacy */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Privacy &amp; Ignored Contacts</h2>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Messages from contacts/groups below are stored privately — no AI classification or task creation.
        </p>

        {/* Blocked list */}
        <div className="space-y-1 mb-3">
          {blockedSenders.length === 0 && (
            <p className="text-xs text-[var(--text-muted)] italic">No ignored contacts yet.</p>
          )}
          {blockedSenders.map((s) => (
            <div key={s.jid} className="flex items-center justify-between py-1.5 px-2 rounded bg-[var(--bg-secondary)]">
              <div className="min-w-0">
                <p className="text-sm text-[var(--text-primary)] truncate">{s.display_name || s.jid}</p>
                {s.display_name && <p className="text-xs text-[var(--text-muted)] truncate">{s.jid}</p>}
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                  {s.type}
                </span>
                <button
                  onClick={() => removeBlockedSender(s.jid)}
                  disabled={privacyLoading}
                  className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add form */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Phone (+91...) or JID"
            value={newJid}
            onChange={(e) => setNewJid(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addBlockedSender()}
            className="flex-1 min-w-0 text-sm px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-[var(--text-muted)]"
          />
          <input
            type="text"
            placeholder="Name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addBlockedSender()}
            className="w-28 text-sm px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-[var(--text-muted)]"
          />
          <button
            onClick={addBlockedSender}
            disabled={privacyLoading || !newJid.trim()}
            className="notion-btn flex items-center gap-1 text-sm shrink-0"
          >
            {privacyLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Add
          </button>
        </div>
      </section>

      {/* WhatsApp */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-3">WhatsApp</h2>
        <div className="flex items-center gap-2 py-2 px-3 bg-[var(--bg-surface-soft)] rounded-lg">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <p className="text-sm text-[var(--text-primary)]">Auto-connect enabled — WhatsApp reconnects automatically on startup and after disconnections.</p>
        </div>
      </section>

      <div className="divider" />

      {/* Danger Zone */}
      <section>
        <h2 className="text-xs font-medium text-red-500 uppercase tracking-wide mb-3">Danger Zone</h2>
        
        {/* Sign Out */}
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm text-[var(--text-primary)]">Sign Out</p>
            <p className="text-xs text-[var(--text-muted)]">Log out of your account</p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
          >
            {signingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            {signingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>

        {/* Clear Data */}
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm text-[var(--text-primary)]">Clear All Data</p>
            <p className="text-xs text-[var(--text-muted)]">Delete all messages, tasks, and logs</p>
          </div>
          <button
            onClick={clearAllData}
            disabled={clearing}
            className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1"
          >
            {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {clearing ? 'Clearing...' : 'Clear'}
          </button>
        </div>

        {/* Delete Account */}
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm text-red-500">Delete Account</p>
            <p className="text-xs text-[var(--text-muted)]">Permanently erase your account and all data</p>
          </div>
          <button
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
            className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
          >
            {deletingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {deletingAccount ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </section>

      {/* Version */}
      <p className="text-xs text-[var(--text-muted)] text-center mt-8">
        Mindline v1.0
      </p>
    </div>
  )
}
