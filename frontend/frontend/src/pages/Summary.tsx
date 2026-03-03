/**
 * Daily Summary Page
 * Shows a day-by-day digest combining WhatsApp + Gmail messages
 * with stats, top senders, category breakdown, and expandable message lists.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Mail, MessageCircle, ChevronDown, ChevronUp,
  RefreshCw, AlertCircle, Inbox, Zap, Clock,
  Users, Tag, TrendingUp,
} from 'lucide-react';
import { API_BASE, authFetch } from '../services/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface WAMessage {
  id: string;
  sender_name: string;
  sender_number: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  classification?: string;
  decision?: string;
  priority?: string;
}

interface GmailMessage {
  id: string;
  from_name: string;
  from_email: string;
  subject: string;
  snippet: string;
  gmail_timestamp: string;
  is_read: boolean;
  classification?: string;
  decision?: string;
  priority?: string;
}

interface UnifiedMessage {
  id: string;
  source: 'whatsapp' | 'gmail';
  sender: string;
  subject: string;
  snippet: string;
  timestamp: Date;
  isRead: boolean;
  classification?: string;
  decision?: string;
  priority?: string;
}

interface DaySummary {
  dateKey: string;
  label: string;
  messages: UnifiedMessage[];
  waCount: number;
  gmailCount: number;
  unreadCount: number;
  actionableCount: number;
  urgentCount: number;
  topSenders: { name: string; count: number }[];
  categoryBreakdown: { label: string; count: number; color: string }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  work:         'bg-blue-500',
  study:        'bg-purple-500',
  personal:     'bg-green-500',
  finance:      'bg-yellow-500',
  spam:         'bg-red-400',
  promo:        'bg-orange-400',
  alert:        'bg-red-500',
  news:         'bg-sky-400',
  unclassified: 'bg-gray-400',
};

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(dateKey: string): string {
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86400000));
  if (dateKey === today) return 'Today';
  if (dateKey === yesterday) return 'Yesterday';
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name.split(' ').map((w: string) => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
}

function avatarColor(name: string): string {
  const palette = [
    'bg-indigo-500','bg-purple-500','bg-pink-500','bg-rose-500',
    'bg-orange-500','bg-amber-500','bg-teal-500','bg-cyan-500',
    'bg-sky-500','bg-emerald-500',
  ];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length];
}

function buildDays(messages: UnifiedMessage[]): DaySummary[] {
  const byDate = new Map<string, UnifiedMessage[]>();
  for (const m of messages) {
    const k = toDateKey(m.timestamp);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(m);
  }

  const days: DaySummary[] = [];
  for (const [dateKey, msgs] of byDate) {
    msgs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const senderCounts = new Map<string, number>();
    for (const m of msgs) {
      const skip = !m.sender || (m.source === 'whatsapp' && m.sender === 'Me');
      if (!skip) senderCounts.set(m.sender, (senderCounts.get(m.sender) || 0) + 1);
    }
    const topSenders = [...senderCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const catCounts = new Map<string, number>();
    for (const m of msgs) {
      const c = m.classification || 'unclassified';
      catCounts.set(c, (catCounts.get(c) || 0) + 1);
    }
    const categoryBreakdown = [...catCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, color: CAT_COLORS[label] || 'bg-gray-400' }));

    days.push({
      dateKey, label: dayLabel(dateKey), messages: msgs,
      waCount:     msgs.filter(m => m.source === 'whatsapp').length,
      gmailCount:  msgs.filter(m => m.source === 'gmail').length,
      unreadCount: msgs.filter(m => !m.isRead).length,
      actionableCount: msgs.filter(m => m.decision === 'action_required' || m.decision === 'respond').length,
      urgentCount: msgs.filter(m => m.priority === 'urgent' || m.priority === 'high').length,
      topSenders, categoryBreakdown,
    });
  }
  return days.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
      <span className={accent || 'text-[var(--text-secondary)]'}>{icon}</span>
      <span className="text-xl font-bold text-[var(--text-primary)]">{value}</span>
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

function SourceIcon({ source }: { source: 'whatsapp' | 'gmail' }) {
  if (source === 'whatsapp') {
    return (
      <span className="shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
        <MessageCircle className="w-3 h-3 text-white" />
      </span>
    );
  }
  return (
    <span className="shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
      <Mail className="w-3 h-3 text-white" />
    </span>
  );
}

function CategoryBar({ items, total }: { items: { label: string; count: number; color: string }[]; total: number }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      {items.slice(0, 5).map(item => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-20 text-xs text-[var(--text-secondary)] capitalize truncate">{item.label}</span>
          <div className="flex-1 h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${item.color} transition-all`}
              style={{ width: `${Math.round((item.count / total) * 100)}%` }} />
          </div>
          <span className="w-6 text-right text-xs text-[var(--text-muted)]">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function DayCard({ day }: { day: DaySummary }) {
  const [expanded, setExpanded] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const isToday = day.label === 'Today';

  return (
    <div className={`rounded-xl border overflow-hidden ${isToday ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-[var(--border-color)] bg-[var(--bg-card)]'}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--bg-hover)] transition-colors text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-base font-semibold ${isToday ? 'text-indigo-400' : 'text-[var(--text-primary)]'}`}>{day.label}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] font-medium">{day.messages.length}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {day.waCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <MessageCircle className="w-3 h-3" />{day.waCount} WA
              </span>
            )}
            {day.gmailCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <Mail className="w-3 h-3" />{day.gmailCount} Gmail
              </span>
            )}
            {day.unreadCount > 0 && (
              <span className="text-xs text-[var(--text-muted)]">{day.unreadCount} unread</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {day.urgentCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-400 font-medium">
              <Zap className="w-3 h-3" />{day.urgentCount} urgent
            </span>
          )}
          {day.actionableCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
              <AlertCircle className="w-3 h-3" />{day.actionableCount} action
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border-color)] px-5 py-4 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {day.topSenders.length > 0 && (
              <div>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-3">
                  <Users className="w-3.5 h-3.5" /> Top Senders
                </h4>
                <div className="space-y-2">
                  {day.topSenders.map(s => (
                    <div key={s.name} className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full ${avatarColor(s.name)} flex items-center justify-center shrink-0`}>
                        <span className="text-[9px] font-bold text-white">{initials(s.name)}</span>
                      </div>
                      <span className="flex-1 text-xs text-[var(--text-primary)] truncate">{s.name}</span>
                      <span className="text-xs text-[var(--text-muted)] font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {day.categoryBreakdown.length > 0 && (
              <div>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-3">
                  <Tag className="w-3.5 h-3.5" /> Categories
                </h4>
                <CategoryBar items={day.categoryBreakdown} total={day.messages.length} />
              </div>
            )}
          </div>

          {(day.urgentCount > 0 || day.actionableCount > 0) && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 px-4 py-3 space-y-1.5">
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Highlights
              </h4>
              {day.urgentCount > 0 && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {day.urgentCount} message{day.urgentCount > 1 ? 's' : ''} marked as <strong>urgent</strong> — review soon.
                </p>
              )}
              {day.actionableCount > 0 && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {day.actionableCount} message{day.actionableCount > 1 ? 's' : ''} need{day.actionableCount === 1 ? 's' : ''} a response or follow-up.
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => setShowMessages(m => !m)}
            className="flex items-center gap-2 text-xs text-[var(--accent)] hover:opacity-80 font-medium"
          >
            {showMessages ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showMessages ? 'Hide messages' : `Show all ${day.messages.length} messages`}
          </button>

          {showMessages && (
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {day.messages.map(m => (
                <div key={m.id}
                  className={`flex items-start gap-2.5 py-2 px-3 rounded-lg ${!m.isRead ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[var(--bg-hover)]'} transition-colors`}>
                  <SourceIcon source={m.source} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-xs font-medium truncate ${!m.isRead ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{m.sender}</span>
                      {m.source === 'gmail' && <span className="text-xs text-[var(--text-muted)] truncate">{m.subject}</span>}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] truncate">{m.snippet}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.priority === 'urgent' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">urgent</span>}
                    {m.classification && m.classification !== 'unclassified' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] capitalize">{m.classification}</span>
                    )}
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {m.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Summary() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waMessages, setWaMessages] = useState<WAMessage[]>([]);
  const [gmailMessages, setGmailMessages] = useState<GmailMessage[]>([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [waRes, gmailStatusRes] = await Promise.all([
        authFetch(`${API_BASE}/messages?limit=500`),
        authFetch(`${API_BASE}/gmail/status`).catch(() => null),
      ]);

      if (!waRes.ok) throw new Error('Failed to load WhatsApp messages');
      const waData = await waRes.json();
      setWaMessages(Array.isArray(waData) ? waData : (waData.data || waData.messages || []));

      if (gmailStatusRes?.ok) {
        const statusData = await gmailStatusRes.json();
        const connected = statusData.connected ?? false;
        setGmailConnected(connected);
        if (connected) {
          const gmailRes = await authFetch(`${API_BASE}/gmail/messages?limit=500`);
          if (gmailRes.ok) {
            const gData = await gmailRes.json();
            setGmailMessages(gData.data || gData.messages || []);
          }
        }
      }
      setLastRefreshed(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const unified = useMemo<UnifiedMessage[]>(() => {
    const wa: UnifiedMessage[] = waMessages
      .filter(m => !m.is_from_me)
      .map(m => ({
        id: `wa-${m.id}`,
        source: 'whatsapp' as const,
        sender: m.sender_name || m.sender_number || 'Unknown',
        subject: m.content?.slice(0, 60) || '',
        snippet: m.content || '',
        timestamp: new Date(m.timestamp),
        isRead: true,
        classification: m.classification,
        decision: m.decision,
        priority: m.priority,
      }));

    const gm: UnifiedMessage[] = gmailMessages.map(m => ({
      id: `gm-${m.id}`,
      source: 'gmail' as const,
      sender: m.from_name || m.from_email || 'Unknown',
      subject: m.subject || '(no subject)',
      snippet: m.snippet || '',
      timestamp: new Date(m.gmail_timestamp),
      isRead: m.is_read,
      classification: m.classification,
      decision: m.decision,
      priority: m.priority,
    }));

    return [...wa, ...gm];
  }, [waMessages, gmailMessages]);

  const days = useMemo(() => buildDays(unified), [unified]);
  const todayDay = days.find(d => d.label === 'Today');
  const totalMessages  = unified.length;
  const totalActionable = unified.filter(m => m.decision === 'action_required' || m.decision === 'respond').length;
  const totalUrgent    = unified.filter(m => m.priority === 'urgent' || m.priority === 'high').length;
  const totalUnread    = unified.filter(m => !m.isRead).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-muted)]">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading summary…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Daily Summary</h1>
          {lastRefreshed && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              {gmailConnected && <span> · Gmail connected</span>}
            </p>
          )}
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors border border-[var(--border-color)]">
          <RefreshCw className="w-3.5 h-3.5" />Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg">{error}</div>
      )}

      {/* Stat chips */}
      {totalMessages > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip icon={<Inbox className="w-4 h-4" />} label="total" value={totalMessages} />
          <StatChip icon={<Mail className="w-4 h-4" />} label="unread" value={totalUnread} accent="text-blue-400" />
          <StatChip icon={<AlertCircle className="w-4 h-4" />} label="actionable" value={totalActionable} accent="text-amber-400" />
          <StatChip icon={<Zap className="w-4 h-4" />} label="urgent" value={totalUrgent} accent="text-red-400" />
        </div>
      )}

      {/* Today banner */}
      {todayDay && (
        <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-400 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Today at a glance
            </h3>
            <span className="text-xs text-[var(--text-muted)]">{todayDay.messages.length} messages</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {todayDay.waCount > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <MessageCircle className="w-4 h-4 text-green-500" />
                <span className="font-medium text-[var(--text-primary)]">{todayDay.waCount}</span>
                <span className="text-[var(--text-muted)]">WhatsApp</span>
              </div>
            )}
            {todayDay.gmailCount > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <Mail className="w-4 h-4 text-red-400" />
                <span className="font-medium text-[var(--text-primary)]">{todayDay.gmailCount}</span>
                <span className="text-[var(--text-muted)]">Gmail</span>
              </div>
            )}
            {todayDay.unreadCount > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                <span className="font-medium text-[var(--text-primary)]">{todayDay.unreadCount}</span>
                <span className="text-[var(--text-muted)]">unread</span>
              </div>
            )}
            {todayDay.actionableCount > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="font-medium text-[var(--text-primary)]">{todayDay.actionableCount}</span>
                <span className="text-[var(--text-muted)]">need action</span>
              </div>
            )}
            {todayDay.urgentCount > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <Zap className="w-4 h-4 text-red-400" />
                <span className="font-medium text-[var(--text-primary)]">{todayDay.urgentCount}</span>
                <span className="text-[var(--text-muted)]">urgent</span>
              </div>
            )}
          </div>
          {todayDay.topSenders.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Top:</span>
              {todayDay.topSenders.slice(0, 3).map(s => (
                <div key={s.name} className="flex items-center gap-1">
                  <div className={`w-5 h-5 rounded-full ${avatarColor(s.name)} flex items-center justify-center`}>
                    <span className="text-[8px] font-bold text-white">{initials(s.name)}</span>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">{s.name.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Day cards */}
      {days.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No messages yet. Connect WhatsApp or Gmail to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map(day => <DayCard key={day.dateKey} day={day} />)}
        </div>
      )}
    </div>
  );
}
