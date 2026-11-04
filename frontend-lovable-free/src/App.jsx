import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Mail,
  Inbox,
  Paperclip,
  Download,
  Plus,
  Search,
  Copy,
  Trash2,
  Bell,
  BellOff,
  RefreshCw,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Layers,
  HardDrive,
  Sparkles,
  ExternalLink,
  Code2,
  Eye,
  Server
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Web Audio API synthesized arrival chime (A5 -> D6 sine wave)
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

// Generate consistent avatar color from email address
function getAvatarColor(email) {
  const colors = [
    'bg-indigo-600',
    'bg-violet-600',
    'bg-emerald-600',
    'bg-amber-600',
    'bg-rose-600',
    'bg-cyan-600',
    'bg-blue-600',
    'bg-fuchsia-600'
  ];
  let hash = 0;
  for (let i = 0; i < (email || '').length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Durable Objects Virtual Mailbox Slug
function getDoMailboxId(address) {
  if (!address) return 'global-inbox';
  return 'do-' + address.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 24);
}

export default function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('html'); // 'html', 'text', 'raw'
  const [stats, setStats] = useState({ total: 0, today: 0, top_recipients: [] });
  const [health, setHealth] = useState({
    smtp: 'checking...',
    db: 'Cloudflare D1 / SQLite',
    mode: 'FREE - Open Source',
    agentic_inbox_enabled: true
  });
  const [listenerState, setListenerState] = useState({ sse: 'connecting', poll: 'standby', ping: null, supabase: 'ready' });
  const [toast, setToast] = useState(null);
  const [desktopNotifGranted, setDesktopNotifGranted] = useState(false);

  // Address Manager State (Durable Objects Virtual Mailboxes)
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

  // Persist registered mailboxes
  useEffect(() => {
    try {
      localStorage.setItem('relay_custom_addresses', JSON.stringify(registeredAddresses));
    } catch (e) {
      // Storage unavailable
    }
  }, [registeredAddresses]);

  // Check notification permission
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
      if (perm === 'granted') {
        showToast('Desktop notifications enabled!', 'success');
      } else {
        showToast('Desktop notifications permission denied', 'error');
      }
    } catch {
      showToast('Notification request failed', 'error');
    }
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const notifyNewEmail = useCallback((email) => {
    playArrivalChime();
    showToast(`New email for ${email.to_addr || email.to_address}: ${email.subject}`, 'success');
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`New email for ${email.to_addr || email.to_address}`, {
          body: `${email.from_addr || email.from_address} — ${email.subject}`,
          icon: '/favicon.ico',
        });
      } catch {
        // Notification failed
      }
    }
  }, []);

  // Fetch emails
  const fetchEmails = async () => {
    const startTime = performance.now();
    try {
      const res = await fetch(`${API_BASE}/api/emails?limit=250`);
      if (res.ok) {
        const data = await res.json();
        // Normalize schema between D1 and backend
        const normalized = data.map((item) => ({
          id: item.id,
          from_addr: item.from_addr || item.from_address || '',
          to_addr: item.to_addr || item.to_address || '',
          subject: item.subject || '(no subject)',
          created_at: item.created_at || (item.received_at ? new Date(item.received_at).toISOString() : new Date().toISOString()),
          body_html: item.body_html || item.html_content || null,
          body_text: item.body_text || item.text_content || '',
          raw_mime: item.raw_mime || '',
          attachments: typeof item.attachments === 'string' ? JSON.parse(item.attachments || '[]') : (item.attachments || [])
        }));

        setEmails((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(normalized)) return prev;
          return normalized;
        });
        if (normalized.length > 0 && !selectedEmail) {
          setSelectedEmail(normalized[0]);
        }
      }
      const pingMs = Math.round(performance.now() - startTime);
      setListenerState((s) => ({ ...s, ping: pingMs }));
    } catch (err) {
      console.warn('API error fetching emails:', err);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      setHealth({
        smtp: 'Cloudflare Email Routing',
        db: 'D1 + SQLite',
        mode: '100% Free Open Source',
        agentic_inbox_enabled: true
      });
    }
  };

  // Initial load and periodic reconciliation
  useEffect(() => {
    fetchEmails();
    fetchHealth();

    const interval = setInterval(() => {
      fetchEmails();
      fetchHealth();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Real-Time SSE Stream Listener (Triple-Layer)
  useEffect(() => {
    let evtSource;
    let cancelled = false;

    const connectSSE = () => {
      try {
        evtSource = new EventSource(`${API_BASE}/api/stream`);
        evtSource.onopen = () => {
          if (!cancelled) {
            setListenerState((s) => ({ ...s, sse: 'live', poll: 'standby' }));
          }
        };

        evtSource.onerror = () => {
          if (!cancelled) {
            setListenerState((s) => ({ ...s, sse: 'reconnecting', poll: 'active (fallback)' }));
          }
        };

        evtSource.addEventListener('new_email', (event) => {
          try {
            const rawMail = JSON.parse(event.data);
            const newMail = {
              id: rawMail.id,
              from_addr: rawMail.from_addr || rawMail.from || '',
              to_addr: rawMail.to_addr || rawMail.to || '',
              subject: rawMail.subject || '(no subject)',
              created_at: rawMail.created_at || new Date().toISOString(),
              body_html: rawMail.body_html || null,
              body_text: rawMail.body_text || '',
              raw_mime: rawMail.raw_mime || rawMail.raw || '',
              attachments: rawMail.attachments || []
            };

            setEmails((prev) => {
              if (prev.some((e) => e.id === newMail.id)) return prev;
              return [newMail, ...prev];
            });
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

  // Combine observed recipient addresses with registered addresses (Durable Objects list)
  const allInboxes = useMemo(() => {
    const counts = {};
    emails.forEach((e) => {
      const addr = (e.to_addr || 'unknown').toLowerCase();
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
      doId: getDoMailboxId(item.address)
    })).sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));
  }, [emails, registeredAddresses]);

  // Filtered emails
  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      const matchesRecipient = selectedRecipient
        ? (e.to_addr || '').toLowerCase() === selectedRecipient.toLowerCase()
        : true;
      const query = searchQuery.trim().toLowerCase();
      if (!query) return matchesRecipient;

      const matchesSearch =
        (e.subject || '').toLowerCase().includes(query) ||
        (e.from_addr || '').toLowerCase().includes(query) ||
        (e.to_addr || '').toLowerCase().includes(query) ||
        (e.body_text || '').toLowerCase().includes(query);

      return matchesRecipient && matchesSearch;
    });
  }, [emails, selectedRecipient, searchQuery]);

  // Auto-select first email in active filter
  useEffect(() => {
    if (filteredEmails.length > 0) {
      if (!selectedEmail || !filteredEmails.some((e) => e.id === selectedEmail.id)) {
        setSelectedEmail(filteredEmails[0]);
      }
    } else {
      setSelectedEmail(null);
    }
  }, [filteredEmails, selectedEmail]);

  // Address creation
  const handleAddAddress = (e) => {
    e.preventDefault();
    const addr = newAddressInput.trim().toLowerCase();
    if (!addr) {
      setAddressError('Please enter an email address.');
      return;
    }
    const pattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!pattern.test(addr)) {
      setAddressError('Please enter a valid format, e.g. name@yourdomain.com');
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
    showToast(`Created Virtual Mailbox: ${addr}`, 'success');
  };

  const handleDeleteAddress = (addrToDelete) => {
    setRegisteredAddresses((prev) => prev.filter((item) => item.address.toLowerCase() !== addrToDelete.toLowerCase()));
    if (selectedRecipient && selectedRecipient.toLowerCase() === addrToDelete.toLowerCase()) {
      setSelectedRecipient(null);
    }
    showToast(`Removed mailbox ${addrToDelete}`, 'info');
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${text}`, 'success');
  };

  const exportCsv = () => {
    if (filteredEmails.length === 0) return;
    const headers = ['ID', 'Date', 'From', 'To', 'Subject', 'Body'];
    const rows = filteredEmails.map((e) => [
      e.id,
      e.created_at,
      `"${(e.from_addr || '').replace(/"/g, '""')}"`,
      `"${(e.to_addr || '').replace(/"/g, '""')}"`,
      `"${(e.subject || '').replace(/"/g, '""')}"`,
      `"${(e.body_text || '').replace(/"/g, '""').slice(0, 300)}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `emails-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadEml = (email) => {
    if (!email || !email.raw_mime) return;
    const blob = new Blob([email.raw_mime], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `email-${email.id}.eml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-xl animate-fade-in border border-emerald-400/30">
          <Bell className="w-4 h-4" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Bar / Agentic Mission Control Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
            </span>
            <h1 className="font-semibold text-white tracking-tight text-sm flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-emerald-400" />
              <span>Inbox Orbit</span>
              <span className="text-xs text-slate-400 font-normal">| Agentic Mail Viewer</span>
            </h1>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3" />
            <span>Cloudflare Engine Active</span>
          </div>

          <span className="hidden md:inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50">
            <HardDrive className="w-3 h-3 text-indigo-400" />
            <span>D1 + R2 Ready</span>
          </span>

          {listenerState.ping !== null && (
            <span className="hidden lg:inline font-mono text-[11px] text-slate-400">
              {listenerState.ping}ms ping
            </span>
          )}
        </div>

        {/* Global Live Counters & Actions */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5">
            <div>
              <span className="text-slate-400">TOTAL: </span>
              <span className="font-bold text-slate-100">{emails.length}</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400">SSE: </span>
              <span className={`font-bold ${listenerState.sse === 'live' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {listenerState.sse}
              </span>
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
            {desktopNotifGranted ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{desktopNotifGranted ? 'Alerts On' : 'Enable Alerts'}</span>
          </button>

          <a
            href="https://inbox-orbit-mail-viewer.lovable.app"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1.5 font-sans font-medium hover:bg-indigo-600/30 transition text-xs"
          >
            <span>Live Cloud</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      {/* Main 3-Column Interface (Gmail/Wren & Agentic-Inbox style) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar: Virtual Inboxes with DO Isolation */}
        <aside className="w-64 flex flex-col border-r border-slate-800 bg-slate-900/60 shrink-0">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">DO Mailboxes</h2>
            </div>
            <button
              onClick={() => setIsAddAddressOpen(true)}
              className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded px-2 py-1 transition"
            >
              <Plus className="w-3 h-3" />
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
                <Inbox className="w-3.5 h-3.5 text-slate-400" />
                <span>All Mailboxes</span>
              </div>
              <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-[11px] text-slate-400">
                {emails.length}
              </span>
            </button>

            {allInboxes.map((item) => {
              const isSelected = selectedRecipient?.toLowerCase() === item.address.toLowerCase();
              return (
                <div
                  key={item.address}
                  className={`group flex items-center justify-between rounded px-2.5 py-2 text-xs transition ${
                    isSelected ? 'bg-slate-800 text-white border-l-2 border-emerald-500' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <button
                    onClick={() => setSelectedRecipient(item.address)}
                    className="flex-1 text-left truncate flex flex-col min-w-0 mr-1"
                  >
                    <span className="truncate font-mono text-[12px]">{item.address}</span>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span className="font-mono text-indigo-400 truncate">{item.doId}</span>
                      {item.label && <span className="truncate">• {item.label}</span>}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-[10px] text-slate-400">
                      {item.count}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(item.address);
                      }}
                      title="Copy Address"
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-white text-slate-400 transition"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {!item.autoDetected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAddress(item.address);
                        }}
                        title="Delete Mailbox"
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-slate-400 transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Engine Footer */}
          <div className="p-2.5 border-t border-slate-800 text-[11px] text-slate-400 font-mono flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span>Engine:</span>
              <span className="text-emerald-400 font-semibold">PostalMime + D1</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span>Storage:</span>
              <span className="text-slate-300">{health.db || 'D1 / SQLite'}</span>
            </div>
          </div>
        </aside>

        {/* Middle Column: Email List */}
        <section className="w-80 lg:w-96 flex flex-col border-r border-slate-800 bg-slate-950 shrink-0">
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search sender, recipient, subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{filteredEmails.length} messages</span>
              <button
                onClick={exportCsv}
                className="hover:text-slate-200 transition underline underline-offset-2 flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No emails found for this mailbox.
              </div>
            ) : (
              filteredEmails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;
                const senderInitial = (email.from_addr || '?')[0].toUpperCase();
                const avatarColor = getAvatarColor(email.from_addr);

                return (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`p-3 cursor-pointer transition text-xs flex items-start gap-2.5 ${
                      isSelected
                        ? 'bg-slate-900 border-l-2 border-emerald-500'
                        : 'hover:bg-slate-900/40'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-[11px] shrink-0 ${avatarColor}`}>
                      {senderInitial}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-semibold text-slate-200 truncate pr-2">{email.from_addr}</span>
                        <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                          {new Date(email.created_at || Date.now()).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="text-slate-100 font-medium truncate mb-0.5">{email.subject || '(No Subject)'}</div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono truncate">
                        <span className="truncate">To: {email.to_addr}</span>
                        {email.attachments && email.attachments.length > 0 && (
                          <span className="flex items-center gap-0.5 text-amber-400 shrink-0 text-[10px]">
                            <Paperclip className="w-3 h-3" />
                            <span>{email.attachments.length}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Column: Gmail/Wren & Agentic Email Viewer */}
        <main className="flex-1 flex flex-col bg-slate-900/30 overflow-hidden">
          {selectedEmail ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header details */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-start justify-between">
                <div className="space-y-1.5 flex-1 pr-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-white tracking-tight">{selectedEmail.subject}</h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {getDoMailboxId(selectedEmail.to_addr)}
                    </span>
                  </div>

                  <div className="text-xs space-y-0.5 text-slate-400 font-mono">
                    <div className="flex items-center gap-2">
                      <span>From:</span>
                      <span className="text-slate-200 font-medium">{selectedEmail.from_addr}</span>
                      <button onClick={() => copyToClipboard(selectedEmail.from_addr)} className="text-slate-500 hover:text-slate-300">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>To:</span>
                      <span className="text-slate-200">{selectedEmail.to_addr}</span>
                    </div>
                    <div>Date: <span className="text-slate-300">{selectedEmail.created_at}</span></div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => downloadEml(selectedEmail)}
                    className="flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-xs text-slate-200 font-mono transition"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download .eml</span>
                  </button>
                </div>
              </div>

              {/* R2 Attachments Bar (if present) */}
              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
                  <span className="text-xs font-mono text-slate-400 flex items-center gap-1 shrink-0">
                    <Paperclip className="w-3.5 h-3.5 text-amber-400" />
                    <span>R2 Attachments ({selectedEmail.attachments.length}):</span>
                  </span>
                  {selectedEmail.attachments.map((att, idx) => (
                    <a
                      key={att.id || idx}
                      href={att.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      download={att.filename}
                      className="flex items-center gap-1.5 text-xs bg-slate-900 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded text-slate-300 hover:text-white transition shrink-0"
                    >
                      <FileText className="w-3 h-3 text-indigo-400" />
                      <span className="font-mono truncate max-w-[140px]">{att.filename}</span>
                      {att.size && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({Math.round(att.size / 1024)} KB)
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              )}

              {/* Content View Tabs (Wren style) */}
              <div className="flex items-center gap-2 px-4 pt-2 border-b border-slate-800/80 bg-slate-900/40 text-xs font-mono">
                <button
                  onClick={() => setActiveTab('html')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 transition ${
                    activeTab === 'html'
                      ? 'border-emerald-500 text-emerald-400 font-bold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Parsed Body</span>
                </button>
                <button
                  onClick={() => setActiveTab('text')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 transition ${
                    activeTab === 'text'
                      ? 'border-emerald-500 text-emerald-400 font-bold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Plain Text</span>
                </button>
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 transition ${
                    activeTab === 'raw'
                      ? 'border-emerald-500 text-emerald-400 font-bold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Raw RFC 822</span>
                </button>
              </div>

              {/* Message Body */}
              <div className="flex-1 overflow-y-auto p-5">
                {activeTab === 'raw' ? (
                  <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap bg-slate-950 p-4 rounded border border-slate-800">
                    {selectedEmail.raw_mime}
                  </pre>
                ) : activeTab === 'text' ? (
                  <pre className="font-sans text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-950/60 p-4 rounded border border-slate-800">
                    {selectedEmail.body_text || selectedEmail.raw_mime}
                  </pre>
                ) : selectedEmail.body_html ? (
                  <div
                    className="prose prose-invert max-w-none text-slate-200 text-sm bg-slate-950/40 p-4 rounded border border-slate-800"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                  />
                ) : (
                  <pre className="font-sans text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-950/60 p-4 rounded border border-slate-800">
                    {selectedEmail.body_text || selectedEmail.raw_mime}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
              <Mail className="w-10 h-10 mb-2 opacity-40" />
              <span>Select an email from the list to view its contents</span>
            </div>
          )}
        </main>
      </div>

      {/* Modal: Add Email Address */}
      {isAddAddressOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Create Virtual Mailbox</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Powered by Cloudflare Email Routing & Durable Objects virtual address isolation.
            </p>

            <form onSubmit={handleAddAddress} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. support@yourdomain.com"
                  value={newAddressInput}
                  onChange={(e) => setNewAddressInput(e.target.value)}
                  className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Label (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Customer Inquiries"
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
