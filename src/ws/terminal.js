const os = require("os");
const { activePTYs } = require("../lib/pty-manager");

function setupTerminalWs(termWss) {
    termWss.on("connection", (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const ptyId = url.searchParams.get("ptyId");
        const cols = parseInt(url.searchParams.get("cols")) || 120;
        const rows = parseInt(url.searchParams.get("rows")) || 30;

        if (ptyId && activePTYs.has(ptyId)) {
            // Reconnect to existing persistent PTY
            const entry = activePTYs.get(ptyId);

            if (entry.exited) {
                ws.send(JSON.stringify({ type: "terminal:exit", exitCode: -1 }));
                ws.close();
                return;
            }

            entry.clients.add(ws);

            ws.send(JSON.stringify({
                type: "terminal:ready", termId: ptyId, shell: entry.config.command,
                pid: entry.proc.pid, reconnected: true,
            }));

            if (entry.scrollback) {
                ws.send(JSON.stringify({ type: "terminal:output", data: entry.scrollback }));
            }

            try { entry.proc.resize(cols, rows); } catch { /* ignore */ }

            ws.on("message", raw => {
                try {
                    const msg = JSON.parse(raw);
                    if (msg.type === "terminal:input") entry.proc.write(msg.data);
                    else if (msg.type === "terminal:resize") entry.proc.resize(msg.cols, msg.rows);
                } catch { /* ignore */ }
            });

            ws.on("close", () => {
                entry.clients.delete(ws);
            });

        } else {
            // Ephemeral terminal (backward compat)
            const pty = require("node-pty");
            const shell = os.platform() === "win32" ? "powershell.exe" : (process.env.SHELL || "bash");
            const proc = pty.spawn(shell, [], {
                name: "xterm-256color", cols, rows,
                cwd: process.env.USERPROFILE || process.env.HOME || process.cwd(),
                env: { ...process.env, TERM: "xterm-256color" },
            });

            ws.send(JSON.stringify({
                type: "terminal:ready", termId: `ephemeral-${Date.now()}`, shell, pid: proc.pid,
            }));

            proc.onData(data => {
                if (ws.readyState === 1) ws.send(JSON.stringify({ type: "terminal:output", data }));
            });
            proc.onExit(({ exitCode }) => {
                if (ws.readyState === 1) ws.send(JSON.stringify({ type: "terminal:exit", exitCode }));
                ws.close();
            });

            ws.on("message", raw => {
                try {
                    const msg = JSON.parse(raw);
                    if (msg.type === "terminal:input") proc.write(msg.data);
                    else if (msg.type === "terminal:resize") proc.resize(msg.cols, msg.rows);
                } catch { /* ignore */ }
            });

            ws.on("close", () => { try { proc.kill(); } catch { /* ignore */ } });
        }
    });
}

module.exports = { setupTerminalWs };
