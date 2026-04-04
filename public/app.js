/* ── Copilot Session Portal — Client ── */
const API = "";
let currentSessionId = null;
let currentPage = 0;
const PAGE_SIZE = 30;
let searchTerm = "";
let terminalWs = null;
let xterm = null;
let fitAddon = null;

// ── Markdown renderer setup ──
const renderer = new marked.Renderer();
marked.setOptions({
    renderer,
    highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
            try { return hljs.highlight(code, { language: lang }).value; } catch {}
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true,
});

function renderMarkdown(text) {
    if (!text) return "";
    try { return marked.parse(text); } catch { return escHtml(text); }
}

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
    loadStats();
    loadSessions();
    setupSearch();
    setupWebSocket();
    setupTerminal();
    setupChat();
    setupTheme();
    document.getElementById("chatBtn").addEventListener("click", () => openTerminal("copilot"));
    document.getElementById("refreshBtn").addEventListener("click", () => { loadStats(); loadSessions(); });

    // Stats toggle
    document.getElementById("statsToggle").addEventListener("click", () => {
        const bar = document.getElementById("statsBar");
        const visible = bar.style.display !== "none";
        bar.style.display = visible ? "none" : "flex";
        localStorage.setItem("statsVisible", !visible);
    });
    if (localStorage.getItem("statsVisible") === "true") {
        document.getElementById("statsBar").style.display = "flex";
    }

    // Sidebar toggle
    document.getElementById("sidebarToggle").addEventListener("click", toggleSidebar);
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "b") { e.preventDefault(); toggleSidebar(); }
    });
    // Restore sidebar state
    if (localStorage.getItem("sidebarCollapsed") === "true") {
        document.querySelector(".main-layout").classList.add("sidebar-collapsed");
    }
});

// ── WebSocket ──
let wsRetries = 0;
function setupWebSocket() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}`);
    const badge = document.getElementById("connectionBadge");

    ws.onopen = () => { badge.textContent = "● live"; badge.classList.add("connected"); wsRetries = 0; };
    ws.onerror = () => {};
    ws.onclose = () => {
        badge.textContent = "disconnected"; badge.classList.remove("connected");
        if (wsRetries < 10) { wsRetries++; setTimeout(setupWebSocket, Math.min(1000 * Math.pow(2, wsRetries), 30000)); }
        else { badge.textContent = "offline"; }
    };
    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "sessions_updated") { loadStats(); loadSessions(); }
        if (msg.type === "session:turns" && msg.sessionId === currentSessionId) {
            // Live update: append new turns to conversation if it's visible
            const activeTab = document.querySelector(".tab.active");
            if (activeTab && activeTab.dataset.tab === "conversation") {
                appendLiveTurns(msg.turns);
            }
            // Update turn count badge
            const countEl = document.querySelector('.tab[data-tab="conversation"] .count');
            if (countEl) countEl.textContent = msg.totalTurns;
        }
    };
}

// ── Stats ──
async function loadStats() {
    try {
        const data = await fetchJson("/api/stats");
        document.getElementById("statTotal").textContent = data.totalSessions;
        document.getElementById("statActive").textContent = data.activeDirs;
        document.getElementById("stat24h").textContent = data.last24h;
        document.getElementById("statTurns").textContent = formatNumber(data.totalTurns);
        document.getElementById("statFiles").textContent = formatNumber(data.totalFiles);
    } catch { /* ignore */ }
}

// ── Sessions List ──
async function loadSessions() {
    const list = document.getElementById("sessionList");
    try {
        const params = new URLSearchParams({ limit: PAGE_SIZE, offset: currentPage * PAGE_SIZE });
        if (searchTerm) params.set("search", searchTerm);
        const data = await fetchJson(`/api/sessions?${params}`);
        renderSessionList(data.sessions, data.total);
    } catch (err) {
        list.innerHTML = `<div class="loading" style="animation:none">⚠ Failed to load sessions</div>`;
    }
}

function renderSessionList(sessions, total) {
    const list = document.getElementById("sessionList");

    if (sessions.length === 0) {
        list.innerHTML = `<div class="empty-state" style="padding:40px"><p>No sessions found</p></div>`;
        document.getElementById("pagination").innerHTML = "";
        return;
    }

    list.innerHTML = sessions.map(s => `
        <div class="session-item ${s.id === currentSessionId ? "selected" : ""}" data-id="${s.id}">
            <div class="session-title">
                ${s.isActive ? '<span class="active-dot"></span>' : ""}
                ${escHtml(s.summary || s.branch || "Untitled Session")}
            </div>
            <div class="session-meta">
                ${s.repository ? `<span>📦 ${escHtml(shortRepo(s.repository))}</span>` : ""}
                ${s.branch ? `<span>🌿 ${escHtml(s.branch)}</span>` : ""}
                <span>🕐 ${timeAgo(s.updated_at)}</span>
            </div>
            <div class="session-id">${s.id}</div>
        </div>
    `).join("");

    list.querySelectorAll(".session-item").forEach(el => {
        el.addEventListener("click", () => selectSession(el.dataset.id));
    });

    // Pagination
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const pag = document.getElementById("pagination");
    if (totalPages <= 1) { pag.innerHTML = ""; return; }
    pag.innerHTML = `
        <button ${currentPage === 0 ? "disabled" : ""} onclick="changePage(-1)">◀ Prev</button>
        <span class="page-info">${currentPage + 1} / ${totalPages}</span>
        <button ${currentPage >= totalPages - 1 ? "disabled" : ""} onclick="changePage(1)">Next ▶</button>
    `;
}

function changePage(delta) { currentPage = Math.max(0, currentPage + delta); loadSessions(); }

// ── Session Detail ──
async function selectSession(id) {
    currentSessionId = id;
    document.querySelectorAll(".session-item").forEach(el => el.classList.toggle("selected", el.dataset.id === id));

    const panel = document.getElementById("detailPanel");
    panel.innerHTML = `<div class="loading">Loading session…</div>`;

    try {
        const session = await fetchJson(`/api/sessions/${id}`);
        renderDetail(session);
    } catch (err) {
        panel.innerHTML = `<div class="loading" style="animation:none">Failed: ${err.message}</div>`;
    }
}

function renderDetail(s) {
    const panel = document.getElementById("detailPanel");

    // On mobile, show detail and hide list
    const layout = document.querySelector(".main-layout");
    if (window.innerWidth <= 900) layout.classList.add("show-detail");

    panel.innerHTML = `
        <div class="mobile-back" onclick="document.querySelector('.main-layout').classList.remove('show-detail')">← Back to sessions</div>
        <div class="detail-header">
            <div class="detail-title">
                ${s.isActive ? '<span class="active-dot" style="width:10px;height:10px;border-radius:50%;background:#3fb950;box-shadow:0 0 8px #3fb950;display:inline-block"></span>' : ""}
                ${escHtml(s.summary || s.branch || "Untitled Session")}
            </div>
            <div class="detail-meta">
                <span class="tag">${s.id}</span>
                ${s.repository ? `<span>📦 ${escHtml(s.repository)}</span>` : ""}
                ${s.branch ? `<span>🌿 ${escHtml(s.branch)}</span>` : ""}
                <span>📂 ${escHtml(shortPath(s.cwd))}</span>
                <span>🕐 Created ${formatDate(s.created_at)}</span>
                <span>🔄 Updated ${timeAgo(s.updated_at)}</span>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px">
                <button class="copilot-launch-btn" onclick="openTerminal('copilot', { sessionId: '${escAttr(s.id)}', sessionLabel: '${escAttr(s.summary || s.branch || s.id.slice(0,8))}' })">🤖 Resume in Copilot</button>
                <button class="copilot-launch-btn shell" onclick="openTerminal('shell', { sessionId: '${escAttr(s.id)}', sessionLabel: '${escAttr(s.summary || s.branch || s.id.slice(0,8))}' })">⌨ Open Shell Here</button>
            </div>
        </div>
        <div class="tabs">
            <button class="tab active" data-tab="conversation">💬 Conversation <span class="count">${s.turnCount}</span></button>
            <button class="tab" data-tab="files">📁 Files <span class="count">${s.fileCount}</span></button>
            <button class="tab" data-tab="checkpoints">🏁 Checkpoints <span class="count">${s.checkpointCount}</span></button>
            <button class="tab" data-tab="refs">🔗 Refs <span class="count">${s.refCount}</span></button>
        </div>
        <div class="tab-content" id="tabContent">
            <div class="loading">Loading conversation…</div>
        </div>
    `;

    panel.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            panel.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            loadTab(s.id, tab.dataset.tab);
        });
    });

    loadTab(s.id, "conversation");
}

async function loadTab(sessionId, tabName) {
    const content = document.getElementById("tabContent");
    content.innerHTML = `<div class="loading">Loading…</div>`;

    try {
        switch (tabName) {
            case "conversation": return renderConversation(sessionId, content);
            case "files": return renderFiles(sessionId, content);
            case "checkpoints": return renderCheckpoints(sessionId, content);
            case "refs": return renderRefs(sessionId, content);
        }
    } catch (err) {
        content.innerHTML = `<div class="loading" style="animation:none">Error: ${err.message}</div>`;
    }
}

async function renderFiles(id, el) {
    const files = await fetchJson(`/api/sessions/${id}/files`);
    if (files.length === 0) { el.innerHTML = `<div class="empty-state"><p>No files recorded</p></div>`; return; }

    el.innerHTML = `<ul class="file-list">${files.map(f => `
        <li class="file-item">
            <span class="file-icon">${f.tool_name === "create" ? "🆕" : f.tool_name === "edit" ? "✏️" : "📄"}</span>
            <span class="file-path clickable" data-path="${escAttr(f.file_path)}" title="Click to view">${escHtml(f.file_path)}</span>
            <span class="file-tool ${f.tool_name}">${f.tool_name}</span>
            <span style="font-size:11px;color:var(--text-muted)">Turn ${f.turn_index}</span>
            <button class="file-dl-btn" data-path="${escAttr(f.file_path)}" title="Download">⬇</button>
        </li>
    `).join("")}</ul>`;

    // View file on click
    el.querySelectorAll(".file-path.clickable").forEach(fp => {
        fp.addEventListener("click", () => viewFile(fp.dataset.path));
    });
    // Download button
    el.querySelectorAll(".file-dl-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            downloadFile(btn.dataset.path);
        });
    });
}

async function renderCheckpoints(id, el) {
    const cps = await fetchJson(`/api/sessions/${id}/checkpoints`);
    if (cps.length === 0) { el.innerHTML = `<div class="empty-state"><p>No checkpoints recorded</p></div>`; return; }

    el.innerHTML = cps.map(cp => `
        <div class="checkpoint">
            <div class="checkpoint-header">
                <span class="num">${cp.checkpoint_number}</span>
                ${escHtml(cp.title || "Checkpoint")}
            </div>
            <div class="checkpoint-body">
                ${cp.overview ? `<section><h4>Overview</h4><div class="markdown-body">${renderMarkdown(cp.overview)}</div></section>` : ""}
                ${cp.work_done ? `<section><h4>Work Done</h4><div class="markdown-body">${renderMarkdown(cp.work_done)}</div></section>` : ""}
                ${cp.technical_details ? `<section><h4>Technical Details</h4><div class="markdown-body">${renderMarkdown(cp.technical_details)}</div></section>` : ""}
                ${cp.important_files ? `<section><h4>Important Files</h4><div class="markdown-body">${renderMarkdown(cp.important_files)}</div></section>` : ""}
                ${cp.next_steps ? `<section><h4>Next Steps</h4><div class="markdown-body">${renderMarkdown(cp.next_steps)}</div></section>` : ""}
            </div>
        </div>
    `).join("");
}

async function renderRefs(id, el) {
    const refs = await fetchJson(`/api/sessions/${id}/refs`);
    if (refs.length === 0) { el.innerHTML = `<div class="empty-state"><p>No refs (commits, PRs, issues) recorded</p></div>`; return; }

    el.innerHTML = refs.map(r => `
        <div class="ref-item">
            <span class="ref-type ${r.ref_type}">${r.ref_type}</span>
            <span style="font-family:monospace;color:var(--accent)">${escHtml(r.ref_value)}</span>
            <span style="font-size:11px;color:var(--text-muted)">Turn ${r.turn_index} · ${formatDate(r.created_at)}</span>
        </div>
    `).join("");
}

// ── Search ──
function setupSearch() {
    let timeout;
    document.getElementById("globalSearch").addEventListener("input", (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            searchTerm = e.target.value.trim();
            currentPage = 0;
            loadSessions();
        }, 300);
    });
}

// ── Helpers ──
async function fetchJson(url) { const r = await fetch(API + url); if (!r.ok) throw new Error(r.statusText); return r.json(); }
function escHtml(s) { if (!s) return ""; const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return (s || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;"); }

// ── Theme ──
const XTERM_THEMES = {
    dark: {
        background: "#0d1117", foreground: "#e6edf3", cursor: "#58a6ff",
        selectionBackground: "#58a6ff44",
        black: "#0d1117", red: "#f85149", green: "#3fb950", yellow: "#d29922",
        blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf", white: "#e6edf3",
        brightBlack: "#6e7681", brightRed: "#ff7b72", brightGreen: "#56d364",
        brightYellow: "#e3b341", brightBlue: "#79c0ff", brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd", brightWhite: "#f0f6fc",
    },
    light: {
        background: "#ffffff", foreground: "#1f2328", cursor: "#0969da",
        selectionBackground: "#0969da33",
        black: "#24292f", red: "#cf222e", green: "#1a7f37", yellow: "#9a6700",
        blue: "#0969da", magenta: "#8250df", cyan: "#1b7c83", white: "#6e7781",
        brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#116329",
        brightYellow: "#4d2d00", brightBlue: "#0550ae", brightMagenta: "#6639ba",
        brightCyan: "#136061", brightWhite: "#8c959f",
    },
};

function getTheme() {
    return localStorage.getItem("theme") || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    document.getElementById("themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
    // Update all open terminals
    terminals.forEach(entry => { entry.xterm.options.theme = XTERM_THEMES[theme]; });
    if (xterm) xterm.options.theme = XTERM_THEMES[theme];
}

function setupTheme() {
    applyTheme(getTheme());
    document.getElementById("themeToggle").addEventListener("click", () => {
        applyTheme(getTheme() === "dark" ? "light" : "dark");
    });
}

// ── Sidebar Toggle ──
function toggleSidebar() {
    const layout = document.querySelector(".main-layout");
    layout.classList.toggle("sidebar-collapsed");
    localStorage.setItem("sidebarCollapsed", layout.classList.contains("sidebar-collapsed"));
    const entry = terminals.get(activeTabId);
    if (entry) setTimeout(() => entry.fitAddon.fit(), 350);
}

// ── Touch Key Bar ──
function setupTouchBar(term) {
    const bar = document.getElementById("touchBar");
    let ctrlActive = false;

    // Remove old listeners (re-entry safe)
    const newBar = bar.cloneNode(true);
    bar.parentNode.replaceChild(newBar, bar);

    newBar.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        e.preventDefault();

        // Ctrl modifier toggle
        if (btn.dataset.modifier === "ctrl") {
            ctrlActive = !ctrlActive;
            btn.classList.toggle("active", ctrlActive);
            btn.style.background = ctrlActive ? "var(--accent-dim)" : "";
            return;
        }

        const key = btn.dataset.key;
        if (!key) return;

        if (btn.dataset.ctrl === "true" || ctrlActive) {
            // Send Ctrl+key (char code 1-26)
            const code = key.toLowerCase().charCodeAt(0) - 96;
            if (code > 0 && code <= 26) sendToActiveTerm(String.fromCharCode(code));
            if (ctrlActive) {
                ctrlActive = false;
                const ctrlBtn = newBar.querySelector('[data-modifier="ctrl"]');
                if (ctrlBtn) { ctrlBtn.classList.remove("active"); ctrlBtn.style.background = ""; }
            }
        } else {
            // Map special keys to escape sequences
            const keyMap = {
                "Escape": "\x1b",
                "Tab": "\t",
                "ArrowUp": "\x1b[A",
                "ArrowDown": "\x1b[B",
                "ArrowRight": "\x1b[C",
                "ArrowLeft": "\x1b[D",
                "PageUp": "\x1b[5~",
                "PageDown": "\x1b[6~",
                "Home": "\x1b[H",
                "End": "\x1b[F",
            };
            const data = keyMap[key] || key;
            sendToActiveTerm(data);
        }
        // Don't focus terminal — avoids mobile keyboard popup
    });
}

function sendToActiveTerm(data) {
    const entry = terminals.get(activeTabId);
    if (entry && entry.ws && entry.ws.readyState === 1) {
        entry.ws.send(JSON.stringify({ type: "terminal:input", data }));
    }
}

function changeFontSize(delta) {
    const entry = terminals.get(activeTabId);
    if (!entry) return;
    const current = entry.xterm.options.fontSize || 14;
    const newSize = Math.max(8, Math.min(28, current + delta));
    entry.xterm.options.fontSize = newSize;
    localStorage.setItem("termFontSize", newSize);
    entry.fitAddon.fit();
    // Sync PTY size
    if (entry.ws && entry.ws.readyState === 1) {
        entry.ws.send(JSON.stringify({ type: "terminal:resize", cols: entry.xterm.cols, rows: entry.xterm.rows }));
    }
}
function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + "\n\n… [truncated]" : s || ""; }
function formatNumber(n) { return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }
function estimateTokens(s) { return s ? formatNumber(s.length) : "0"; }
function shortRepo(r) { if (!r) return ""; const parts = r.split("/"); return parts.length > 2 ? parts.slice(-2).join("/") : r; }
function shortPath(p) { if (!p) return ""; const parts = p.replace(/\\/g, "/").split("/"); return parts.length > 3 ? "…/" + parts.slice(-2).join("/") : p; }

function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
           d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso) {
    if (!iso) return "";
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
    return formatDate(iso);
}

// ── Multi-Tab Terminal ──
const terminals = new Map();
let activeTabId = null;
let termPanelState = "closed";
const TAB_COLORS = ["#58a6ff", "#3fb950", "#d29922", "#bc8cff", "#f85149", "#39c5cf", "#f0883e", "#db61a2"];

function setupTerminal() {
    document.getElementById("terminalBtn").addEventListener("click", () => openTerminal());
    document.getElementById("termNewShell").addEventListener("click", () => openTerminal("shell"));
    document.getElementById("termNewCopilot").addEventListener("click", () => openTerminal("copilot"));
    document.getElementById("termMinMax").addEventListener("click", toggleTermSize);
    document.getElementById("termClose").addEventListener("click", closeActiveTab);
    document.getElementById("termFontUp").addEventListener("click", () => changeFontSize(2));
    document.getElementById("termFontDown").addEventListener("click", () => changeFontSize(-2));
}

async function openTerminal(mode = "shell", opts = {}) {
    const panel = document.getElementById("termPanel");
    panel.style.display = "flex";
    panel.classList.remove("minimized");
    termPanelState = panel.classList.contains("maximized") ? "maximized" : "normal";

    const tabId = `tab-${Date.now()}`;
    let ptyId = null;

    // Create PTY on server
    if (mode !== "reconnect") {
        try {
            const body = { command: mode === "copilot" ? "copilot" : "shell" };
            if (opts.sessionId) body.sessionId = opts.sessionId;
            if (opts.cwd) body.cwd = opts.cwd;
            body.cols = 120; body.rows = 30;

            const resp = await fetch("/api/ptys", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await resp.json();
            if (data.error) throw new Error(data.error);
            ptyId = data.ptyId;
        } catch (err) {
            alert("Failed to create PTY: " + err.message);
            if (terminals.size === 0) panel.style.display = "none";
            return;
        }
    } else {
        ptyId = opts.ptyId;
    }

    // Create xterm
    const term = new window.Terminal({
        cursorBlink: true, fontSize: parseInt(localStorage.getItem("termFontSize")) || 14,
        fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
        theme: XTERM_THEMES[getTheme()],
        allowProposedApi: true,
    });
    const fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new window.WebLinksAddon.WebLinksAddon());

    // Bell: beep sound + browser notification
    term.onBell(() => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.15;
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } catch {}
        if (Notification.permission === "granted") {
            new Notification("Terminal Bell", { body: entry.label, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🔔</text></svg>" });
        }
    });
    if (Notification.permission === "default") Notification.requestPermission();

    // Create pane
    const pane = document.createElement("div");
    pane.className = "term-pane";
    pane.id = tabId;
    document.getElementById("termContent").appendChild(pane);
    term.open(pane);

    const label = mode === "copilot"
        ? (opts.sessionLabel || opts.sessionId?.slice(0, 8) || "Copilot")
        : "Shell";
    const icon = mode === "copilot" ? "🤖" : "⌨";
    const colorIdx = terminals.size % TAB_COLORS.length;
    const entry = { xterm: term, fitAddon: fit, ws: null, ptyId, label: `${icon} ${label}`, status: "connecting", pane, colorIdx };
    terminals.set(tabId, entry);

    // Switch to this tab
    switchTab(tabId);

    // Fit FIRST, then connect — prevents mangled output from wrong dimensions
    await new Promise(r => setTimeout(r, 150));
    fit.fit();
    term.focus();

    // Connect WebSocket after terminal is properly sized
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/terminal?ptyId=${ptyId}&cols=${term.cols}&rows=${term.rows}`);
    entry.ws = ws;

    ws.onopen = () => {
        entry.status = "connected";
        // Sync PTY size with xterm's actual dimensions after connect
        ws.send(JSON.stringify({ type: "terminal:resize", cols: term.cols, rows: term.rows }));
        renderTabs();
    };
    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "terminal:output") term.write(msg.data);
        else if (msg.type === "terminal:ready") { entry.status = "connected"; renderTabs(); }
        else if (msg.type === "terminal:exit") {
            term.write(`\r\n\x1b[33m[Exited: ${msg.exitCode}]\x1b[0m\r\n`);
            entry.status = "exited";
            renderTabs();
            setTimeout(() => removeTab(tabId), 2000);
        }
    };
    ws.onclose = () => {
        if (entry.status !== "exited") { entry.status = "disconnected"; renderTabs(); }
    };

    term.onData(data => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "terminal:input", data })); });
    term.onResize(({ cols, rows }) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "terminal:resize", cols, rows })); });

    // Resize observer
    const resizeObs = new ResizeObserver(() => { if (pane.classList.contains("active")) fit.fit(); });
    resizeObs.observe(pane);
    entry.resizeObs = resizeObs;

    // Wire up touch key bar
    setupTouchBar(term);

    renderTabs();
}

function switchTab(tabId) {
    activeTabId = tabId;
    document.querySelectorAll(".term-pane").forEach(p => p.classList.remove("active"));
    const entry = terminals.get(tabId);
    if (entry) {
        entry.pane.classList.add("active");
        setTimeout(() => { entry.fitAddon.fit(); entry.xterm.focus(); }, 50);
    }
    renderTabs();
}

function removeTab(tabId) {
    const entry = terminals.get(tabId);
    if (!entry) return;
    if (entry.ws) entry.ws.close();
    if (entry.resizeObs) entry.resizeObs.disconnect();
    entry.xterm.dispose();
    entry.pane.remove();
    terminals.delete(tabId);

    if (terminals.size === 0) {
        document.getElementById("termPanel").style.display = "none";
        termPanelState = "closed";
        activeTabId = null;
    } else if (activeTabId === tabId) {
        switchTab(terminals.keys().next().value);
    }
    renderTabs();
}

function closeActiveTab() {
    if (activeTabId) removeTab(activeTabId);
}

function toggleTermSize() {
    const panel = document.getElementById("termPanel");
    const btn = document.getElementById("termMinMax");
    if (panel.classList.contains("maximized")) {
        panel.classList.remove("maximized");
        btn.textContent = "▲";
        termPanelState = "normal";
    } else if (panel.classList.contains("minimized")) {
        panel.classList.remove("minimized");
        btn.textContent = "▲";
        termPanelState = "normal";
    } else {
        panel.classList.add("maximized");
        btn.textContent = "▼";
        termPanelState = "maximized";
    }
    // Refit active terminal
    const entry = terminals.get(activeTabId);
    if (entry) setTimeout(() => entry.fitAddon.fit(), 100);
}

function renderTabs() {
    const container = document.getElementById("termTabs");
    container.innerHTML = "";
    terminals.forEach((entry, tabId) => {
        const tab = document.createElement("button");
        const isActive = tabId === activeTabId;
        tab.className = `term-tab ${isActive ? "active" : ""}`;
        const color = TAB_COLORS[entry.colorIdx || 0];
        const dotClass = entry.status === "exited" ? "exited" : "";
        if (isActive) tab.style.borderBottomColor = color;
        tab.innerHTML = `<span class="tab-dot ${dotClass}" style="background:${dotClass ? '' : color}"></span>${entry.label}<span class="tab-close" data-id="${tabId}">✕</span>`;
        tab.addEventListener("click", (e) => {
            if (e.target.classList.contains("tab-close")) { removeTab(e.target.dataset.id); return; }
            switchTab(tabId);
        });
        container.appendChild(tab);
    });

    // Double-click tab bar to minimize/restore
    const tabBar = document.querySelector(".term-tab-bar");
    tabBar.ondblclick = () => {
        const panel = document.getElementById("termPanel");
        if (panel.classList.contains("minimized")) {
            panel.classList.remove("minimized");
            const entry = terminals.get(activeTabId);
            if (entry) setTimeout(() => entry.fitAddon.fit(), 100);
        } else {
            panel.classList.add("minimized");
        }
    };
}

function closeTerminal() {
    // Legacy — close all tabs
    for (const id of [...terminals.keys()]) removeTab(id);
}

// ── Live Turn Appending ──
const renderedTurns = new Set();

function appendLiveTurns(turns) {
    const content = document.getElementById("tabContent");
    if (!content) return;

    for (const t of turns) {
        if (renderedTurns.has(`${currentSessionId}-${t.turn_index}`)) continue;
        renderedTurns.add(`${currentSessionId}-${t.turn_index}`);

        const div = document.createElement("div");
        div.innerHTML = `
            <div class="turn" style="border-color: var(--green); box-shadow: 0 0 8px var(--green-dim);">
                <div class="turn-header user">
                    <span>👤 User — Turn ${t.turn_index} <span class="live-badge">● LIVE</span></span>
                    <span>${formatDate(t.timestamp)}</span>
                </div>
                <div class="turn-body markdown-body">${renderMarkdown(truncate(t.user_message, 4000))}</div>
                ${t.assistant_response ? `
                    <div class="turn-header assistant">
                        <span>🤖 Assistant</span>
                        <span>${estimateTokens(t.assistant_response)} chars</span>
                    </div>
                    <div class="turn-body markdown-body">${renderMarkdown(truncate(t.assistant_response, 8000))}</div>
                ` : ""}
            </div>
        `;
        content.appendChild(div.firstElementChild);
        div.firstElementChild?.scrollIntoView({ behavior: "smooth" });
    }
}

async function renderConversation(id, el) {
    renderedTurns.clear();
    const turns = await fetchJson(`/api/sessions/${id}/turns`);
    if (turns.length === 0) { el.innerHTML = `<div class="empty-state"><p>No conversation turns recorded</p></div>`; return; }

    el.innerHTML = turns.map(t => {
        renderedTurns.add(`${id}-${t.turn_index}`);
        return `
        <div class="turn">
            <div class="turn-header user">
                <span>👤 User — Turn ${t.turn_index}</span>
                <span>${formatDate(t.timestamp)}</span>
            </div>
            <div class="turn-body markdown-body">${renderMarkdown(truncate(t.user_message, 4000))}</div>
            ${t.assistant_response ? `
                <div class="turn-header assistant">
                    <span>🤖 Assistant</span>
                    <span>${estimateTokens(t.assistant_response)} chars</span>
                </div>
                <div class="turn-body markdown-body">${renderMarkdown(truncate(t.assistant_response, 8000))}</div>
            ` : ""}
        </div>
    `}).join("");
}

// ══════════════════════════════════════════
// ── Copilot Chat ──
// ══════════════════════════════════════════
let chatWs = null;
let chatId = null;
let chatStreaming = false;
let chatStreamBuffer = "";

function setupChat() {
    document.getElementById("chatBtn").addEventListener("click", openChat);
    document.getElementById("chatCloseBtn").addEventListener("click", closeChat);
    document.getElementById("chatOverlay").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeChat();
    });

    const input = document.getElementById("chatInput");
    const sendBtn = document.getElementById("chatSendBtn");

    sendBtn.addEventListener("click", sendChatMessage);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    // Auto-resize textarea
    input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
}

function openChat() {
    document.getElementById("chatOverlay").style.display = "flex";
    document.getElementById("chatInput").focus();

    if (chatWs && chatWs.readyState === 1) return; // Already connected

    const statusEl = document.getElementById("chatStatus");
    statusEl.textContent = "connecting…";
    statusEl.className = "chat-status";

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    chatWs = new WebSocket(`${proto}//${location.host}/ws/chat`);

    chatWs.onopen = () => {
        statusEl.textContent = "● connected";
        statusEl.className = "chat-status connected";

        // Create a session if none exists
        if (!chatId) {
            const model = document.getElementById("chatModel").value;
            chatWs.send(JSON.stringify({ type: "chat:create", model }));
        } else {
            chatWs.send(JSON.stringify({ type: "chat:join", chatId }));
        }
    };

    chatWs.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        handleChatMessage(msg);
    };

    chatWs.onclose = () => {
        statusEl.textContent = "disconnected";
        statusEl.className = "chat-status";
    };
}

function handleChatMessage(msg) {
    const statusEl = document.getElementById("chatStatus");
    const messagesEl = document.getElementById("chatMessages");

    switch (msg.type) {
        case "chat:created":
            chatId = msg.chatId;
            statusEl.textContent = `● ${msg.model}`;
            statusEl.className = "chat-status connected";
            break;

        case "chat:joined":
            // Restore history
            messagesEl.innerHTML = "";
            for (const m of msg.history) {
                appendChatBubble(m.role, m.content);
            }
            break;

        case "chat:user":
            appendChatBubble("user", msg.content);
            // Show thinking indicator
            showThinking(true);
            statusEl.textContent = "● thinking…";
            statusEl.className = "chat-status thinking";
            break;

        case "chat:delta":
            showThinking(false);
            chatStreaming = true;
            chatStreamBuffer += msg.content;
            updateStreamingBubble(chatStreamBuffer);
            break;

        case "chat:done":
            chatStreaming = false;
            finalizeStreamingBubble(chatStreamBuffer);
            chatStreamBuffer = "";
            statusEl.textContent = `● ready`;
            statusEl.className = "chat-status connected";
            document.getElementById("chatSendBtn").disabled = false;
            document.getElementById("chatInput").focus();
            break;

        case "chat:error":
            showThinking(false);
            chatStreaming = false;
            chatStreamBuffer = "";
            appendChatBubble("error", msg.error);
            statusEl.textContent = "● error";
            statusEl.className = "chat-status";
            document.getElementById("chatSendBtn").disabled = false;
            break;
    }
}

function sendChatMessage() {
    const input = document.getElementById("chatInput");
    const prompt = input.value.trim();
    if (!prompt || !chatWs || chatWs.readyState !== 1 || !chatId) return;

    input.value = "";
    input.style.height = "auto";
    document.getElementById("chatSendBtn").disabled = true;

    chatWs.send(JSON.stringify({ type: "chat:send", chatId, prompt }));
}

function appendChatBubble(role, content) {
    const messagesEl = document.getElementById("chatMessages");
    // Remove welcome message
    const welcome = messagesEl.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    const div = document.createElement("div");
    div.className = `chat-msg ${role}`;

    if (role === "user") {
        div.textContent = content;
    } else if (role === "error") {
        div.textContent = "⚠ " + content;
    } else {
        div.innerHTML = `<div class="markdown-body">${renderMarkdown(content)}</div>`;
    }

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showThinking(show) {
    const messagesEl = document.getElementById("chatMessages");
    let indicator = messagesEl.querySelector(".chat-thinking");
    if (show && !indicator) {
        indicator = document.createElement("div");
        indicator.className = "chat-thinking";
        indicator.innerHTML = "<span></span><span></span><span></span>";
        messagesEl.appendChild(indicator);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (!show && indicator) {
        indicator.remove();
    }
}

function updateStreamingBubble(content) {
    const messagesEl = document.getElementById("chatMessages");
    let bubble = messagesEl.querySelector(".chat-msg.assistant.streaming");
    if (!bubble) {
        bubble = document.createElement("div");
        bubble.className = "chat-msg assistant streaming";
        messagesEl.appendChild(bubble);
    }
    bubble.innerHTML = `<div class="markdown-body">${renderMarkdown(content)}</div>`;
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function finalizeStreamingBubble(content) {
    const messagesEl = document.getElementById("chatMessages");
    const bubble = messagesEl.querySelector(".chat-msg.assistant.streaming");
    if (bubble) {
        bubble.classList.remove("streaming");
        bubble.innerHTML = `<div class="markdown-body">${renderMarkdown(content)}</div>`;
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function closeChat() {
    document.getElementById("chatOverlay").style.display = "none";
    // Keep connection alive for reconnect
}

// ── File Viewer ──
async function viewFile(filePath) {
    // Create or reuse modal
    let modal = document.getElementById("fileViewerModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "fileViewerModal";
        modal.className = "terminal-overlay";
        modal.innerHTML = `
            <div class="terminal-container" style="max-width:900px">
                <div class="terminal-header" style="color:var(--accent)">
                    <span id="fileViewerTitle">📄 File</span>
                    <div style="display:flex;gap:8px;align-items:center">
                        <button class="icon-btn" id="fileViewerDl" title="Download">⬇</button>
                        <button class="icon-btn" id="fileViewerClose" title="Close">✕</button>
                    </div>
                </div>
                <div id="fileViewerBody" style="flex:1;overflow:auto;padding:0"></div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
        document.getElementById("fileViewerClose").addEventListener("click", () => modal.style.display = "none");
    }

    modal.style.display = "flex";
    const titleEl = document.getElementById("fileViewerTitle");
    const bodyEl = document.getElementById("fileViewerBody");
    const dlBtn = document.getElementById("fileViewerDl");

    titleEl.textContent = "📄 Loading…";
    bodyEl.innerHTML = `<div class="loading">Loading file…</div>`;

    try {
        const data = await fetchJson(`/api/file?path=${encodeURIComponent(filePath)}`);
        titleEl.textContent = `📄 ${data.name}`;
        dlBtn.onclick = () => downloadFile(filePath);

        if (data.isText) {
            const lang = extToLang(data.ext);
            let highlighted;
            if (lang && hljs.getLanguage(lang)) {
                highlighted = hljs.highlight(data.content, { language: lang }).value;
            } else {
                highlighted = hljs.highlightAuto(data.content).value;
            }
            bodyEl.innerHTML = `
                <div style="padding:8px 12px;font-size:11px;color:var(--text-muted);background:var(--bg-card);border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
                    <span>${escHtml(data.path)}</span>
                    <span>${formatFileSize(data.size)} · ${data.ext || "no ext"}</span>
                </div>
                <pre style="margin:0;padding:14px;background:#0d1117;font-size:12px;line-height:1.6;overflow:auto;flex:1"><code class="hljs">${highlighted}</code></pre>
            `;
        } else {
            bodyEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <h3>Binary file</h3>
                    <p>${escHtml(data.name)} (${formatFileSize(data.size)})</p>
                    <button class="icon-btn" onclick="downloadFile('${escAttr(filePath)}')" style="margin-top:8px;padding:6px 16px">⬇ Download</button>
                </div>
            `;
        }
    } catch (err) {
        titleEl.textContent = "📄 Error";
        bodyEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Cannot read file</h3><p>${escHtml(err.message)}</p><p style="font-size:11px;color:var(--text-muted)">${escHtml(filePath)}</p></div>`;
    }
}

function downloadFile(filePath) {
    const a = document.createElement("a");
    a.href = `/api/file/download?path=${encodeURIComponent(filePath)}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function extToLang(ext) {
    const map = {
        ".cs": "csharp", ".js": "javascript", ".ts": "typescript", ".json": "json",
        ".xml": "xml", ".yml": "yaml", ".yaml": "yaml", ".md": "markdown",
        ".html": "html", ".css": "css", ".py": "python", ".go": "go",
        ".rs": "rust", ".java": "java", ".sql": "sql", ".sh": "bash",
        ".ps1": "powershell", ".bicep": "bicep", ".csproj": "xml",
        ".sln": "plaintext", ".dockerfile": "dockerfile", ".toml": "toml",
    };
    return map[ext] || null;
}
