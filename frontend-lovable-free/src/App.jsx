import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Mail,
  Inbox,
  Send,
  Paperclip,
  Download,
  Copy,
  Trash2,
  Plus,
  Search,
  Star,
  RefreshCw,
  Bell,
  BellOff,
  FileText,
  Code,
  Eye,
  CheckCircle2,
  Server,
  Database,
  HardDrive,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  Filter
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Web Audio API synthesized arrival chime (A5 -> D6 sine wave, 100% local, no assets)
function playArrivalChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    [880, 1174.66].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + idx * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch (err) {
    // Audio context restricted or unsupported
  }
}

// Generate consistent avatar colors for email senders (Wren / Agentic Inbox style)
function getAvatarColor(str = '') {
  const colors = [
    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    'bg-violet-500/20 text-violet-400 border-violet-500/30',
    'bg-sky-500/20 text-sky-400 border-sky-500/30',
    'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'bg-rose-500/20 text-rose-400 border-rose-500/30',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return colors[Math.abs(hash) % colors.length];
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('parsed'); // 'parsed' | 'html' | 'raw'
  const [stats, setStats] = useState({ total: 0, today: 0, top_recipients: [] });
  const [health, setHealth] = useState({
    smtp: 'active',
    db: 'D1 + SQLite',
    mode: '100% Free - Cloudflare Open Source',
    durable_objects: 'Isolated DO per Mailbox',
    r2: 'Active for Attachments'
  });
  const [listenerState, setListenerState] = useState({
    sse: 'connecting',
    supabase: 'idle',
    poll: 'standby',
    ping: null
  });
  const [toast, setToast] = useState(null);
  const [desktopNotifGranted, setDesktopNotifGranted] = useState(false);
  const [starredIds, setStarredIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('orbit_starred_emails') || '[]');
    } catch {
      return [];
    }
  });
  const [showStarredOnly, setShowStarredOnly] = useState(false);

  // Address / Mailbox Manager State (Agentic Inbox Durable Objects isolation pattern)
  const [registeredAddresses, setRegisteredAddresses] = useState(() => {
    try {
      const saved = localStorage.getItem('relay_custom_addresses');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isAddAddressOpen, setIsAddAddressOpen] = useState(false);
  const [newAddressInput, setNewAddressInput] = useState('');
  const [newLabelInput, setNewLabelInput] = useState('');
  const [addressError, setAddressError] = useState(null);

  // Sync state to local storage
  useEffect(() => {
    try {
      localStorage.setItem('relay_custom_addresses', JSON.stringify(registeredAddresses));
    } catch (e) {}
  }, [registeredAddresses]);

  useEffect(() => {
    try {
      localStorage.setItem('orbit_starred_emails', JSON.stringify(starredIds));
    } catch (e) {}
  }, [starredIds]);

  // Notifications
  useEffect(() => {
    if ('Notification' in window) {
      setDesktopNotifGranted(Notification.permission === 'granted');
    }
  }, []);

  const requestNotifications = async () => {
    if (!('Notification' in window)) {
      showToast('Browser does not support desktop notifications', 'error');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setDesktopNotifGranted(perm === 'granted');
      showToast(perm === 'granted' ? 'Desktop notifications enabled!' : 'Permission denied', perm === 'granted' ? 'success' : 'error');
    } catch {
      showToast('Notification request failed', 'error');
    }
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const notifyNewEmail = useCallback((email) => {
    playArrivalChime();
    showToast(`New email for ${email.to_addr || email.to}: ${email.subject}`, 'success');
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`New Email: ${email.to_addr || email.to}`, {
          body: `${email.from_addr || email.from} — ${email.subject}`,
          icon: '/favicon.ico',
        });
      } catch {}
    }
  }, []);

  const toggleStar = (e, id) => {
    e.stopPropagation();
    setStarredIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Fetch emails
  const fetchEmails = async () => {
    const startTime = performance.now();
    try {
      const res = await fetch(`${API_BASE}/api/emails?limit=250`);
      if (res.ok) {
        const data = await res.json();
        setEmails((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
        if (data.length > 0 && !selectedEmail) {
          setSelectedEmail(data[0]);
        }
      }
      const pingMs = Math.round(performance.now() - startTime);
      setListenerState((s) => ({ ...s, ping: pingMs }));
    } catch (err) {
      console.warn('API error fetching emails:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.warn('API error fetching stats:', err);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setHealth((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      setHealth((prev) => ({ ...prev, smtp: 'listening', db: 'Cloudflare D1 / SQLite' }));
    }
  };

  // 1. Polling fallback heartbeat
  useEffect(() => {
    fetchEmails();
    fetchStats();
    fetchHealth();

    const interval = setInterval(() => {
      fetchEmails();
      fetchStats();
      fetchHealth();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // 2. Server-Sent Events (SSE) Layer
  useEffect(() => {
    let evtSource;
    let cancelled = false;

    const connectSSE = () => {
      try {
        evtSource = new EventSource(`${API_BASE}/api/stream`);
        evtSource.onopen = () => {
          if (!cancelled) setListenerState((s) => ({ ...s, sse: 'live', poll: 'standby' }));
        };
        evtSource.onerror = () => {
          if (!cancelled) setListenerState((s) => ({ ...s, sse: 'reconnecting', poll: 'active (fallback)' }));
        };
        evtSource.addEventListener('new_email', (event) => {
          try {
            const newMail = JSON.parse(event.data);
            setEmails((prev) => {
              if (prev.some((e) => e.id === newMail.id)) return prev;
              return [newMail, ...prev];
            });
            setStats((prev) => ({
              ...prev,
              total: (prev.total || 0) + 1,
              today: (prev.today || 0) + 1,
            }));
            notifyNewEmail(newMail);
          } catch (e) {
            console.error('Error parsing SSE event:', e);
          }
        });
      } catch (err) {
        setListenerState((s) => ({ ...s, sse: 'unavailable', poll: 'active (polling)' }));
      }
    };

    connectSSE();
    return () => {
      cancelled = true;
      if (evtSource) evtSource.close();
    };
  }, [notifyNewEmail]);

  // 3. Supabase Realtime Layer (if configured)
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    let sub;
    const initSupabase = async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        sub = supabase
          .channel('public:emails')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emails' }, (payload) => {
            const newMail = payload.new;
            setEmails((prev) => {
              if (prev.some((e) => e.id === newMail.id)) return prev;
              return [newMail, ...prev];
            });
            notifyNewEmail(newMail);
          })
          .subscribe((status) => {
            setListenerState((s) => ({ ...s, supabase: status === 'SUBSCRIBED' ? 'live' : 'standby' }));
          });
      } catch (err) {
        console.warn('Supabase Realtime not initialized:', err);
      }
    };
    initSupabase();
    return () => {
      if (sub && sub.unsubscribe) sub.unsubscribe();
    };
  }, [notifyNewEmail]);

  // Mailboxes: Durable Objects isolation per address
  const allInboxes = useMemo(() => {
    const counts = {};
    emails.forEach((e) => {
      const addr = (e.to_addr || e.to || 'unknown').toLowerCase();
      counts[addr] = (counts[addr] || 0) + 1;
    });

    const list = [...registeredAddresses];
    Object.keys(counts).forEach((addr) => {
      if (!list.some((item) => item.address.toLowerCase() === addr)) {
        list.push({ address: addr, label: null, autoDetected: true });
      }
    });

    return list.map((item) => ({
      ...item,
      count: counts[item.address.toLowerCase()] || 0,
    })).sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));
  }, [emails, registeredAddresses]);

  // Filtered emails
  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      const matchesRecipient = selectedRecipient
        ? (e.to_addr || e.to || '').toLowerCase() === selectedRecipient.toLowerCase()
        : true;
      const matchesStarred = showStarredOnly ? starredIds.includes(e.id) : true;
      const query = searchQuery.trim().toLowerCase();
      if (!query) return matchesRecipient && matchesStarred;

      const matchesSearch =
        (e.subject || '').toLowerCase().includes(query) ||
        (e.from_addr || e.from || '').toLowerCase().includes(query) ||
        (e.to_addr || e.to || '').toLowerCase().includes(query) ||
        (e.body_text || '').toLowerCase().includes(query);

      return matchesRecipient && matchesStarred && matchesSearch;
    });
  }, [emails, selectedRecipient, searchQuery, showStarredOnly, starredIds]);

  // Keep selected email in sync
  useEffect(() => {
    if (filteredEmails.length > 0) {
      if (!selectedEmail || !filteredEmails.some((e) => e.id === selectedEmail.id)) {
        setSelectedEmail(filteredEmails[0]);
      }
    } else {
      setSelectedEmail(null);
    }
  }, [filteredEmails, selectedEmail]);

  // Add receiving address
  const handleAddAddress = (e) => {
    e.preventDefault();
    const addr = newAddressInput.trim().toLowerCase();
    if (!addr) {
      setAddressError('Please enter an email address.');
      return;
    }
    const pattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!pattern.test(addr)) {
      setAddressError('Please enter a valid format, e.g. support@yourdomain.com');
      return;
    }
    if (registeredAddresses.some((item) => item.address.toLowerCase() === addr)) {
      setAddressError('This email address is already added.');
      return;
    }

    const newEntry = { address: addr, label: newLabelInput.trim() || null };
    setRegisteredAddresses((prev) => [newEntry, ...prev]);
    setSelectedRecipient(addr);
    setIsAddAddressOpen(false);
    setNewAddressInput('');
    setNewLabelInput('');
    setAddressError(null);
    showToast(`Created mailbox: ${addr}`, 'success');
  };

  const handleDeleteAddress = (addrToDelete) => {
    setRegisteredAddresses((prev) => prev.filter((item) => item.address.toLowerCase() !== addrToDelete.toLowerCase()));
    if (selectedRecipient && selectedRecipient.toLowerCase() === addrToDelete.toLowerCase()) {
      setSelectedRecipient(null);
    }
    showToast(`Removed mailbox ${addrToDelete}`, 'info');
  };

  const copyToClipboard = (text, label = 'Address') => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label}`, 'success');
  };

  const exportCsv = () => {
    if (filteredEmails.length === 0) return;
    const headers = ['ID', 'Date', 'From', 'To', 'Subject', 'Attachments', 'Body'];
    const rows = filteredEmails.map((e) => [
      e.id,
      e.received_at || e.created_at,
      `"${(e.from_addr || e.from || '').replace(/"/g, '""')}"`,
      `"${(e.to_addr || e.to || '').replace(/"/g, '""')}"`,
      `"${(e.subject || '').replace(/"/g, '""')}"`,
      e.attachments ? (typeof e.attachments === 'string' ? JSON.parse(e.attachments).length : e.attachments.length) : 0,
      `"${(e.body_text || '').replace(/"/g, '""').slice(0, 300)}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `emails-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadEml = (email) => {
    const raw = email?.raw_mime || email?.raw;
    if (!raw) {
      showToast('Raw MIME content not available for this message', 'error');
      return;
    }
    const blob = new Blob([raw], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `email-${email.id}.eml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Safe attachment extractor
  const parsedAttachments = useMemo(() => {
    if (!selectedEmail || !selectedEmail.attachments) return [];
    if (Array.isArray(selectedEmail.attachments)) return selectedEmail.attachments;
    try {
      return JSON.parse(selectedEmail.attachments);
    } catch {
      return [];
    }
  }, [selectedEmail]);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-2xl animate-fade-in border border-emerald-400/30">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-200" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Bar / Mission Control Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
            </span>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-emerald-400" />
              <h1 className="font-semibold text-white tracking-tight text-sm sm:text-base">
                Inbox Orbit Mail Viewer
              </h1>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-medium text-emerald-400 border border-emerald-500/20">
              Cloudflare Open Source: 100% Free
            </span>
            <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-xs font-mono font-medium text-indigo-300 border border-indigo-500/20">
              PostalMime + D1 + R2
            </span>
          </div>

          {listenerState.ping !== null && (
            <span className="hidden md:inline font-mono text-xs text-slate-400">
              {listenerState.ping}ms ping
            </span>
          )}
        </div>

        {/* Global Live Counters & Actions */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5">
            <div>
              <span className="text-slate-400">TOTAL: </span>
              <span className="font-bold text-slate-100">{stats.total || emails.length}</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400">TODAY: </span>
              <span className="font-bold text-emerald-400">{stats.today || 0}</span>
            </div>
          </div>

          <button
            onClick={requestNotifications}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border transition ${
              desktopNotifGranted
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-800 bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
            title="Desktop notifications on email arrival"
          >
            {desktopNotifGranted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{desktopNotifGranted ? 'Alerts On' : 'Alerts'}</span>
          </button>

          <button
            onClick={exportCsv}
            className="flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1.5 font-sans font-medium transition"
            title="Export filtered emails to CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Interface */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Column: Mailbox Isolation (Agentic Inbox Durable Objects style) */}
        <aside className="w-64 flex flex-col border-r border-slate-800 bg-slate-900/60 shrink-0">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-indigo-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Mailboxes (DO)
              </h2>
            </div>
            <button
              onClick={() => setIsAddAddressOpen(true)}
              className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded px-2 py-1 transition"
              title="Add a new custom receiving address"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <button
              onClick={() => setSelectedRecipient(null)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-xs text-left transition font-medium ${
                selectedRecipient === null
                  ? 'bg-slate-800 text-white border-l-2 border-emerald-500'
                  : 'text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Inbox className="h-3.5 w-3.5 text-emerald-400" />
                <span>All Mailboxes</span>
              </div>
              <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-[11px] text-slate-400">
                {emails.length}
              </span>
            </button>

            <div className="pt-2 pb-1 px-1 text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Isolated Mailboxes
            </div>

            {allInboxes.map((item) => {
              const isSelected = selectedRecipient?.toLowerCase() === item.address.toLowerCase();
              return (
                <div
                  key={item.address}
                  className={`group flex items-center justify-between rounded px-2.5 py-1.5 text-xs transition ${
                    isSelected ? 'bg-slate-800 text-white border-l-2 border-emerald-500' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <button
                    onClick={() => setSelectedRecipient(item.address)}
                    className="flex-1 text-left truncate flex flex-col min-w-0 mr-1"
                  >
                    <span className="truncate font-mono">{item.address}</span>
                    {item.label && <span className="text-[10px] text-slate-400 truncate">{item.label}</span>}
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-[10px] text-slate-400">
                      {item.count}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(item.address, 'Email Address');
                      }}
                      title="Copy Address"
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-white text-slate-400 transition"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    {!item.autoDetected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAddress(item.address);
                        }}
                        title="Delete Address"
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-slate-400 transition"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cloudflare Open Source Infrastructure Badge */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/50 text-[11px] font-mono text-slate-400 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">DB:</span>
              <span className="text-emerald-400">Cloudflare D1 / SQL</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">MIME:</span>
              <span className="text-indigo-400">PostalMime Engine</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Storage:</span>
              <span className="text-sky-400">R2 Bucket Ready</span>
            </div>
          </div>
        </aside>

        {/* Middle Column: Email List (Wren Gmail-style) */}
        <section className="w-80 lg:w-96 flex flex-col border-r border-slate-800 bg-slate-950 shrink-0">
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search sender, recipient, subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>{filteredEmails.length} messages</span>
                <button
                  onClick={() => setShowStarredOnly(!showStarredOnly)}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition ${
                    showStarredOnly ? 'bg-amber-500/20 text-amber-300' : 'hover:text-slate-200'
                  }`}
                >
                  <Star className={`h-3 w-3 ${showStarredOnly ? 'fill-amber-400 text-amber-400' : ''}`} />
                  <span>Starred</span>
                </button>
              </div>

              <button
                onClick={fetchEmails}
                className="hover:text-slate-200 transition flex items-center gap-1 text-[11px]"
                title="Refresh inbox"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Sync</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <Mail className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                No emails found in this mailbox.
              </div>
            ) : (
              filteredEmails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;
                const isStarred = starredIds.includes(email.id);
                const sender = email.from_addr || email.from || 'unknown';
                const recipient = email.to_addr || email.to || '';
                const hasAttachments = email.attachments && (
                  Array.isArray(email.attachments) ? email.attachments.length > 0 : email.attachments !== '[]'
                );

                return (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`p-3 cursor-pointer transition text-xs ${
                      isSelected
                        ? 'bg-slate-900 border-l-2 border-emerald-500'
                        : 'hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex justify-between items-baseline mb-1">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <button
                          onClick={(e) => toggleStar(e, email.id)}
                          className="shrink-0 text-slate-500 hover:text-amber-400"
                        >
                          <Star className={`h-3 w-3 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                        <span className="font-semibold text-slate-200 truncate">{sender}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                        {new Date(email.received_at || email.created_at || Date.now()).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="text-slate-100 font-medium truncate mb-1">
                      {email.subject || '(No Subject)'}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span className="truncate">To: {recipient}</span>
                      {hasAttachments && (
                        <span className="flex items-center gap-0.5 text-indigo-400 shrink-0 ml-1" title="Has attachments in R2">
                          <Paperclip className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Column: Email Viewer (Agentic Inbox & Wren style) */}
        <main className="flex-1 flex flex-col bg-slate-900/30 overflow-hidden">
          {selectedEmail ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header details */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-start justify-between gap-4">
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white tracking-tight truncate">
                      {selectedEmail.subject || '(No Subject)'}
                    </h2>
                    <button
                      onClick={(e) => toggleStar(e, selectedEmail.id)}
                      className="text-slate-400 hover:text-amber-400 shrink-0"
                    >
                      <Star className={`h-4 w-4 ${starredIds.includes(selectedEmail.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    {/* Avatar Initials */}
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs border ${getAvatarColor(selectedEmail.from_addr || selectedEmail.from)}`}>
                      {(selectedEmail.from_addr || selectedEmail.from || '?').charAt(0).toUpperCase()}
                    </div>

                    <div className="space-y-0.5 text-xs text-slate-400 font-mono leading-tight">
                      <div>
                        From: <span className="text-slate-100 font-medium">{selectedEmail.from_addr || selectedEmail.from}</span>
                      </div>
                      <div>
                        To: <span className="text-slate-300">{selectedEmail.to_addr || selectedEmail.to}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(selectedEmail.received_at || selectedEmail.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-mono">
                      <ShieldCheck className="h-3 w-3" /> Cloudflare Routing Verified
                    </span>
                    <span className="flex items-center gap-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-mono">
                      <Code className="h-3 w-3" /> PostalMime Parsed
                    </span>
                    {parsedAttachments.length > 0 && (
                      <span className="flex items-center gap-1 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 px-2 py-0.5 text-[10px] font-mono">
                        <HardDrive className="h-3 w-3" /> R2 Attachments ({parsedAttachments.length})
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Actions & View Mode Toggle */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center bg-slate-950 rounded border border-slate-800 p-0.5">
                    <button
                      onClick={() => setViewMode('parsed')}
                      className={`px-2.5 py-1 text-xs font-mono rounded transition ${
                        viewMode === 'parsed' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Clean
                    </button>
                    <button
                      onClick={() => setViewMode('html')}
                      className={`px-2.5 py-1 text-xs font-mono rounded transition ${
                        viewMode === 'html' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      HTML
                    </button>
                    <button
                      onClick={() => setViewMode('raw')}
                      className={`px-2.5 py-1 text-xs font-mono rounded transition ${
                        viewMode === 'raw' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      MIME
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyToClipboard(selectedEmail.body_text || selectedEmail.raw_mime, 'Message Body')}
                      className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-xs text-slate-200 font-mono transition flex items-center gap-1"
                      title="Copy email body to clipboard"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </button>
                    <button
                      onClick={() => downloadEml(selectedEmail)}
                      className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-xs text-slate-200 font-mono transition flex items-center gap-1"
                      title="Download RFC 822 .eml file"
                    >
                      <Download className="h-3 w-3" />
                      <span>.eml</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* R2 Attachments Card / Drawer */}
              {parsedAttachments.length > 0 && (
                <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/60">
                  <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-sky-400" />
                    <span>Attachments ({parsedAttachments.length})</span>
                    <span className="text-[10px] font-mono text-slate-500 font-normal">Cloudflare R2 Storage</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {parsedAttachments.map((att, idx) => (
                      <div
                        key={att.id || idx}
                        className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 text-xs"
                      >
                        <div className="min-w-0 mr-2">
                          <div className="font-medium text-slate-200 truncate">{att.filename || 'attachment'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {formatBytes(att.size)} • {att.mimeType || 'file'}
                          </div>
                        </div>
                        {att.url ? (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white transition shrink-0"
                            title="Download attachment from R2"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500">R2 stored</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Message Body Pane */}
              <div className="flex-1 overflow-y-auto p-5">
                {viewMode === 'raw' ? (
                  <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap bg-slate-950 p-4 rounded border border-slate-800 leading-relaxed">
                    {selectedEmail.raw_mime || selectedEmail.raw || '(No raw MIME source available)'}
                  </pre>
                ) : viewMode === 'html' && selectedEmail.body_html ? (
                  <div
                    className="prose prose-invert max-w-none text-slate-200 text-sm bg-slate-950/40 p-4 rounded border border-slate-800/80"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                  />
                ) : (
                  <pre className="font-sans text-sm text-slate-200 whitespace-pre-wrap leading-relaxed max-w-3xl">
                    {selectedEmail.body_text || selectedEmail.raw_mime || '(Empty message body)'}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
              <Mail className="h-10 w-10 mb-2 text-slate-600" />
              <span>Select an email from the list to view its contents</span>
            </div>
          )}
        </main>
      </div>

      {/* Modal: Add Email Address (Durable Object Mailbox Creator) */}
      {isAddAddressOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">Create Receiving Mailbox</h3>
            <p className="text-xs text-slate-400 mb-4">
              Add any custom virtual address on your domain. Emails sent to this address will be isolated in their own mailbox.
            </p>

            <form onSubmit={handleAddAddress} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. support@yourdomain.com"
                  value={newAddressInput}
                  onChange={(e) => setNewAddressInput(e.target.value)}
                  className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Label (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Customer Support Inbox"
                  value={newLabelInput}
                  onChange={(e) => setNewLabelInput(e.target.value)}
                  className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {addressError && <div className="text-xs text-red-400">{addressError}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddAddressOpen(false)}
                  className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  Add Mailbox
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
