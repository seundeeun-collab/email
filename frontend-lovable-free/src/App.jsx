import React, { useState, useEffect, useMemo, useRef } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export default function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [rawView, setRawView] = useState(false);
  const [stats, setStats] = useState({ total: 0, today: 0, top_recipients: [] });
  const [health, setHealth] = useState({ smtp: 'checking...', db: 'ok', mode: 'FREE - No buying' });
  const [sseConnected, setSseConnected] = useState(false);
  const [toast, setToast] = useState(null);

  // Load emails and stats
  const fetchEmails = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/emails?limit=200`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data);
        if (data.length > 0 && !selectedEmail) {
          setSelectedEmail(data[0]);
        }
      }
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
      setHealth({ smtp: 'local-stopped', db: 'offline', mode: 'FREE' });
    }
  };

  useEffect(() => {
    fetchEmails();
    fetchStats();
    fetchHealth();
    const interval = setInterval(() => {
      fetchStats();
      fetchHealth();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Real-Time SSE Stream
  useEffect(() => {
    let evtSource;
    try {
      evtSource = new EventSource(`${API_BASE}/api/stream`);
      evtSource.onopen = () => setSseConnected(true);
      evtSource.onerror = () => setSseConnected(false);

      evtSource.addEventListener('new_email', (event) => {
        try {
          const newMail = JSON.parse(event.data);
          setEmails((prev) => {
            // Deduplicate
            if (prev.some((e) => e.id === newMail.id)) return prev;
            return [newMail, ...prev];
          });
          setStats((prev) => ({
            ...prev,
            total: (prev.total || 0) + 1,
            today: (prev.today || 0) + 1,
          }));

          // Trigger Toast
          setToast(`New email for ${newMail.to_addr}: ${newMail.subject}`);
          setTimeout(() => setToast(null), 4000);
        } catch (e) {
          console.error('Error handling SSE new_email:', e);
        }
      });
    } catch (e) {
      console.warn('SSE not supported or connection error:', e);
    }

    return () => {
      if (evtSource) evtSource.close();
    };
  }, []);

  // Compute distinct recipient counts
  const recipientCounts = useMemo(() => {
    const counts = {};
    emails.forEach((e) => {
      const addr = e.to_addr || 'unknown';
      counts[addr] = (counts[addr] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [emails]);

  // Filter emails based on selected recipient and search
  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      const matchesRecipient = selectedRecipient ? e.to_addr === selectedRecipient : true;
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !query ||
        (e.to_addr && e.to_addr.toLowerCase().includes(query)) ||
        (e.from_addr && e.from_addr.toLowerCase().includes(query)) ||
        (e.subject && e.subject.toLowerCase().includes(query)) ||
        (e.body && e.body.toLowerCase().includes(query));
      return matchesRecipient && matchesSearch;
    });
  }, [emails, selectedRecipient, searchQuery]);

  // Keep selected email synced
  useEffect(() => {
    if (filteredEmails.length > 0 && (!selectedEmail || !filteredEmails.some((e) => e.id === selectedEmail.id))) {
      setSelectedEmail(filteredEmails[0]);
    } else if (filteredEmails.length === 0) {
      setSelectedEmail(null);
    }
  }, [filteredEmails, selectedRecipient]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-400 animate-bounce">
          <span className="text-xl">📬</span>
          <div className="text-sm font-medium">{toast}</div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 font-bold">
            ✉
          </div>
          <div>
            <div className="font-semibold text-sm tracking-tight flex items-center gap-2">
              Virtual Email Server
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                100% Free
              </span>
            </div>
          </div>
        </div>

        {/* Live Indicator & Stats */}
        <div className="flex items-center gap-4 text-xs">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-400 font-medium">
              {sseConnected ? 'SSE Live Stream Active' : 'SMTP 127.0.0.1:1025 Live'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-slate-400">
            <div>Total: <span className="text-slate-100 font-semibold">{stats.total || emails.length}</span></div>
            <div className="hidden md:inline">Today: <span className="text-sky-400 font-semibold">{stats.today || 0}</span></div>
          </div>

          <a
            href={`${API_BASE}/api/export/csv`}
            download
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <span>↓</span> Export CSV
          </a>
        </div>
      </header>

      {/* Main Workspace: 3 Columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Virtual Inboxes */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-800/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Virtual Inboxes</span>
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{recipientCounts.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <button
              onClick={() => setSelectedRecipient(null)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                selectedRecipient === null
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span>📁</span>
                <span className="truncate">All Inboxes</span>
              </div>
              <span className="text-slate-400 font-mono text-[11px]">{emails.length}</span>
            </button>

            {recipientCounts.map(([addr, count]) => (
              <button
                key={addr}
                onClick={() => setSelectedRecipient(addr)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                  selectedRecipient === addr
                    ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-slate-400">@</span>
                  <span className="truncate">{addr}</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">{count}</span>
              </button>
            ))}
          </div>

          {/* Quick Help Footer */}
          <div className="p-3 border-t border-slate-800/60 text-[11px] text-slate-400 space-y-1">
            <div className="font-medium text-slate-300">Public Email Without VPS:</div>
            <div>Cloudflare Email Routing → Worker → <code className="text-sky-300">/api/inbound</code></div>
          </div>
        </aside>

        {/* Middle Column: Email Message List */}
        <section className="w-80 md:w-96 border-r border-slate-800 bg-slate-950 flex flex-col shrink-0">
          {/* Search Header */}
          <div className="p-3 border-b border-slate-800">
            <div className="relative">
              <input
                type="text"
                placeholder="Search recipient, sender, subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
              />
              <span className="absolute left-2.5 top-2 text-xs text-slate-500">🔍</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No emails match your filter.
              </div>
            ) : (
              filteredEmails.map((email) => {
                const isSelected = selectedEmail && selectedEmail.id === email.id;
                return (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`p-3 cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-sky-950/40 border-l-2 border-sky-400'
                        : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span className="font-mono text-sky-400 truncate max-w-[160px]">{email.to_addr}</span>
                      <span className="shrink-0">{email.created_at ? new Date(email.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-200 truncate mb-1">
                      {email.subject || '(no subject)'}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      From: {email.from_addr}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-1">
                      {email.body ? email.body.slice(0, 80) : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Column: Email Detail View */}
        <main className="flex-1 flex flex-col bg-slate-900/30 overflow-hidden">
          {selectedEmail ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Detail Header */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">{selectedEmail.subject}</h2>
                    <div className="mt-2 space-y-0.5 text-xs text-slate-400">
                      <div><span className="text-slate-500">To:</span> <span className="text-sky-400 font-mono">{selectedEmail.to_addr}</span></div>
                      <div><span className="text-slate-500">From:</span> <span className="text-slate-300 font-mono">{selectedEmail.from_addr}</span></div>
                      <div><span className="text-slate-500">Date:</span> <span>{selectedEmail.created_at ? new Date(selectedEmail.created_at).toLocaleString() : ''}</span></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setRawView(!rawView)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        rawView
                          ? 'bg-sky-600 text-white border-sky-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {rawView ? 'Parsed View' : 'Raw MIME'}
                    </button>
                    <a
                      href={`${API_BASE}/api/export/eml/${selectedEmail.id}`}
                      download
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition"
                    >
                      Download .eml
                    </a>
                  </div>
                </div>
              </div>

              {/* Detail Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {rawView ? (
                  <pre className="font-mono text-xs text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                    {selectedEmail.raw || selectedEmail.body}
                  </pre>
                ) : (
                  <div className="bg-slate-950 p-6 rounded-xl border border-slate-800/80 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {selectedEmail.body}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <span className="text-4xl mb-3">📬</span>
              <p className="text-sm font-medium">Select an email to view details</p>
              <p className="text-xs text-slate-600 mt-1">Real-time incoming emails will appear automatically</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
