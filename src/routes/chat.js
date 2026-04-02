const express = require("express");

const chatSessions = new Map();
let sdkModule = null;

async function loadSdk() {
    if (!sdkModule) sdkModule = await import("@github/copilot-sdk");
    return sdkModule;
}

const router = express.Router();

// List active chat sessions
router.get("/api/chat/sessions", (_req, res) => {
    const sessions = [];
    chatSessions.forEach((s, id) => {
        sessions.push({ id, model: s.config.model, cwd: s.config.cwd, createdAt: s.createdAt, turns: s.history.length });
    });
    res.json(sessions);
});

// Create a chat session
router.post("/api/chat/sessions", async (req, res) => {
    try {
        const { model, cwd: sessionCwd } = req.body;
        const sdk = await loadSdk();
        const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const workDir = sessionCwd || process.cwd();

        const client = new sdk.CopilotClient({
            cwd: workDir,
            logLevel: "error",
        });

        const session = await client.createSession({
            model: model || "claude-sonnet-4",
            streaming: true,
            workingDirectory: workDir,
            onPermissionRequest: sdk.approveAll,
        });

        const entry = {
            client,
            session,
            history: [],
            config: { model: model || "claude-sonnet-4", cwd: workDir },
            createdAt: new Date().toISOString(),
            listeners: new Set(),
        };

        chatSessions.set(chatId, entry);
        res.json({ chatId, model: entry.config.model, cwd: workDir });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a chat session
router.delete("/api/chat/sessions/:id", async (req, res) => {
    const entry = chatSessions.get(req.params.id);
    if (!entry) return res.status(404).json({ error: "Not found" });

    try {
        for (const unsub of entry.unsubscribers || []) { try { unsub(); } catch { /* ignore */ } }
        entry.session.disconnect();
        await entry.client.stop();
    } catch { /* ignore */ }

    chatSessions.delete(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
module.exports.chatSessions = chatSessions;
module.exports.loadSdk = loadSdk;
