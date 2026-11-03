import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Web Audio API synthesized arrival chime (A5 -> D6 sine wave, no external audio file required)
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

export default function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [rawView, setRawView] = useState(false);
  const [stats, setStats] = useState({ total: 0, today: 0, top_recipients: [] });
  const [health, setHealth] = useState({ smtp: 'checking...', db: 'ok', mode: 'FREE - No buying' });
  const [listenerState, setListenerState] = useState({ sse: 'connecting', poll: 'standby', ping: null });
  const [toast, setToast] = useState(null);
  const [desktopNotifGranted, setDesktopNotifGranted] = useState(false);

  // Address Manager State
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

  // Save registered addresses
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
    showToast(`New email for ${email.to_addr}: ${email.subject}`, 'success');
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`New email for ${email.to_addr}`, {
          body: `${email.from_addr} — ${email.subject}`,
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
        setHealth(data);
      }
    } catch (err) {
      setHealth({ smtp: 'listening', db: 'ok', mode: 'FREE - No buying' });
    }
  };

  // Initial load and periodic reconciliation
  useEffect(() => {
    fetchEmails();
    fetchStats();
    fetchHealth();

    // Heartbeat & fallback polling (every 6 seconds)
    const interval = setInterval(() => {
      fetchEmails();
      fetchStats();
      fetchHealth();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Real-Time SSE Stream Listener
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

  // Combine observed recipient addresses with registered addresses
  const allInboxes = useMemo(() => {
    const counts = {};
    emails.forEach((e) => {
      const addr = (e.to_addr || 'unknown').toLowerCase();
      counts[addr] = (counts[addr] || 0) + 1;
    });

    const list = [...registeredAddresses];
    // Add observed addresses that were not manually created
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

  // Update selected email when list changes
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
    showToast(`Created receiving address: ${addr}`, 'success');
  };

  const handleDeleteAddress = (addrToDelete) => {
    setRegisteredAddresses((prev) => prev.filter((item) => item.address.toLowerCase() !== addrToDelete.toLowerCase()));
    if (selectedRecipient && selectedRecipient.toLowerCase() === addrToDelete.toLowerCase()) {
      setSelectedRecipient(null);
    }
    showToast(`Removed address ${addrToDelete}`, 'info');
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
      e.received_at || e.created_at,
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
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-xl animate-fade-in">
          <span>🔔</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Bar / Mission Control Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
            </span>
            <h1 className="font-semibold text-white tracking-tight text-base">Relay 1025 Live Inbox</h1>
          </div>
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-medium text-emerald-400 border border-emerald-500/20">
            Realtime Active
          </span>
          {listenerState.ping !== null && (
            <span className="hidden sm:inline font-mono text-xs text-slate-400">
              {listenerState.ping}ms ping
            </span>
          )}
        </div>

        {/* Global Live Counters & Actions */}
        <div className="flex items-center gap-4 text-xs font-mono">
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
            <span>{desktopNotifGranted ? '🔔 Alerts On' : '🔕 Enable Alerts'}</span>
          </button>

          <a
            href="https://inbox-orbit-mail-viewer.lovable.app"
            target="_blank"
            rel="noreferrer"
            className="hidden md:flex items-center gap-1 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1.5 font-sans font-medium hover:bg-indigo-600/30 transition"
          >
            Cloud App ↗
          </a>
        </div>
      </header>

      {/* Main 3-Column Interface */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar: Virtual Inboxes */}
        <aside className="w-64 flex flex-col border-r border-slate-800 bg-slate-900/60 shrink-0">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Receiving Addresses</h2>
            <button
              onClick={() => setIsAddAddressOpen(true)}
              className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded px-2 py-1 transition"
            >
              <span>+</span> Add
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <button
              onClick={() => setSelectedRecipient(null)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-xs text-left transition font-medium ${
                selectedRecipient === null
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>📬</span>
                <span>All Inboxes</span>
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
                  className={`group flex items-center justify-between rounded px-2.5 py-1.5 text-xs transition ${
                    isSelected ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/50'
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
                        copyToClipboard(item.address);
                      }}
                      title="Copy Address"
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-white text-slate-400 transition"
                    >
                      📋
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
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Middle Column: Email List */}
        <section className="w-80 lg:w-96 flex flex-col border-r border-slate-800 bg-slate-950 shrink-0">
          <div className="p-3 border-b border-slate-800 space-y-2">
            <input
              type="text"
              placeholder="Search sender, recipient, subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{filteredEmails.length} messages</span>
              <button
                onClick={exportCsv}
                className="hover:text-slate-200 transition underline underline-offset-2"
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No emails found for this address.
              </div>
            ) : (
              filteredEmails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;
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
                      <span className="font-semibold text-slate-200 truncate pr-2">{email.from_addr}</span>
                      <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                        {new Date(email.received_at || email.created_at || Date.now()).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-slate-100 font-medium truncate mb-1">{email.subject || '(No Subject)'}</div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">To: {email.to_addr}</div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Column: Email Viewer */}
        <main className="flex-1 flex flex-col bg-slate-900/30 overflow-hidden">
          {selectedEmail ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header details */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-start justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white tracking-tight">{selectedEmail.subject}</h2>
                  <div className="text-xs space-y-0.5 text-slate-400 font-mono">
                    <div>From: <span className="text-slate-200">{selectedEmail.from_addr}</span></div>
                    <div>To: <span className="text-slate-200">{selectedEmail.to_addr}</span></div>
                    <div>Date: <span className="text-slate-300">{selectedEmail.received_at || selectedEmail.created_at}</span></div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRawView(!rawView)}
                    className={`rounded px-2.5 py-1 text-xs font-mono font-medium border transition ${
                      rawView
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {rawView ? 'Parsed View' : 'Raw MIME'}
                  </button>
                  <button
                    onClick={() => downloadEml(selectedEmail)}
                    className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-xs text-slate-200 font-mono transition"
                  >
                    Download .eml
                  </button>
                </div>
              </div>

              {/* Message Body */}
              <div className="flex-1 overflow-y-auto p-5">
                {rawView ? (
                  <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap bg-slate-950 p-4 rounded border border-slate-800">
                    {selectedEmail.raw_mime}
                  </pre>
                ) : selectedEmail.body_html ? (
                  <div
                    className="prose prose-invert max-w-none text-slate-200 text-sm"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                  />
                ) : (
                  <pre className="font-sans text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {selectedEmail.body_text || selectedEmail.raw_mime}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
              <span className="text-3xl mb-2">✉️</span>
              <span>Select an email from the list to view its contents</span>
            </div>
          )}
        </main>
      </div>

      {/* Modal: Add Email Address */}
      {isAddAddressOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-2">Create Receiving Email Address</h3>
            <p className="text-xs text-slate-400 mb-4">
              Add any custom virtual address on your domain to receive incoming messages.
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
                  Add Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
