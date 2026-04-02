const os = require("os");
const fs = require("fs");
const path = require("path");
const { getDb } = require("./db");
const { MAX_SCROLLBACK } = require("./config");

const activePTYs = new Map();

function listPTYs() {
    const ptys = [];
    activePTYs.forEach((entry, id) => {
        ptys.push({
            id,
            pid: entry.proc.pid,
            clients: entry.clients.size,
            command: entry.config.command,
            cwd: entry.config.cwd,
            sessionId: entry.config.sessionId || null,
            createdAt: entry.createdAt,
        });
    });
    return ptys;
}

function createPTY({ command, sessionId, cwd: sessionCwd, cols, rows }) {
    // Lazy-require node-pty so tests can run without it
    const pty = require("node-pty");

    const ptyId = `pty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let workDir = (sessionCwd && fs.existsSync(sessionCwd))
        ? sessionCwd
        : (process.env.USERPROFILE || process.env.HOME || process.cwd());

    let cmd, args;
    if (command === "copilot" || !command) {
        const copilotPath = path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "copilot.exe");
        cmd = fs.existsSync(copilotPath) ? copilotPath : "copilot";
        args = [];
        if (sessionId) {
            args.push(`--resume=${sessionId}`);
        } else {
            args.push("--continue");
        }
        args.push("--allow-all");
    } else if (command === "shell") {
        cmd = os.platform() === "win32" ? "powershell.exe" : (process.env.SHELL || "bash");
        args = [];
    } else {
        cmd = command;
        args = [];
    }

    // Look up session's original cwd from DB if not explicitly provided
    if (sessionId && workDir === (process.env.USERPROFILE || process.env.HOME || process.cwd())) {
        try {
            const db = getDb();
            const row = db.prepare("SELECT cwd FROM sessions WHERE id = ?").get(sessionId);
            if (row && row.cwd && fs.existsSync(row.cwd)) workDir = row.cwd;
            db.close();
        } catch { /* ignore */ }
    }

    const proc = pty.spawn(cmd, args, {
        name: "xterm-256color",
        cols: cols || 120,
        rows: rows || 30,
        cwd: workDir,
        env: { ...process.env, TERM: "xterm-256color" },
    });

    const entry = {
        proc,
        clients: new Set(),
        scrollback: "",
        config: { command: cmd, args, cwd: workDir, sessionId },
        createdAt: new Date().toISOString(),
    };

    proc.onData(data => {
        entry.scrollback += data;
        if (entry.scrollback.length > MAX_SCROLLBACK) {
            entry.scrollback = entry.scrollback.slice(-MAX_SCROLLBACK);
        }
        const msg = JSON.stringify({ type: "terminal:output", data });
        entry.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
    });

    proc.onExit(({ exitCode }) => {
        entry.exited = true;
        const exitMsg = JSON.stringify({ type: "terminal:exit", exitCode });
        entry.clients.forEach(ws => { if (ws.readyState === 1) ws.send(exitMsg); });
        setTimeout(() => activePTYs.delete(ptyId), 2000);
    });

    activePTYs.set(ptyId, entry);
    return { ptyId, pid: proc.pid, command: cmd, cwd: workDir };
}

function deletePTY(ptyId) {
    const entry = activePTYs.get(ptyId);
    if (!entry) return null;
    try { entry.proc.kill(); } catch { /* ignore */ }
    activePTYs.delete(ptyId);
    return { ok: true };
}

function getPTY(ptyId) {
    return activePTYs.get(ptyId);
}

module.exports = { activePTYs, listPTYs, createPTY, deletePTY, getPTY };
