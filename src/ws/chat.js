const { chatSessions, loadSdk } = require("../routes/chat");

function setupChatWs(chatWss) {
    chatWss.on("connection", ws => {
        ws.chatSessionId = null;
        ws.send(JSON.stringify({ type: "chat:connected" }));

        ws.on("message", async raw => {
            try {
                const msg = JSON.parse(raw);

                if (msg.type === "chat:join") {
                    const entry = chatSessions.get(msg.chatId);
                    if (!entry) return ws.send(JSON.stringify({ type: "chat:error", error: "Session not found" }));
                    ws.chatSessionId = msg.chatId;
                    entry.listeners.add(ws);
                    ws.send(JSON.stringify({ type: "chat:joined", chatId: msg.chatId, history: entry.history }));
                }

                if (msg.type === "chat:create") {
                    try {
                        const sdk = await loadSdk();
                        const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                        const workDir = msg.cwd || process.cwd();

                        const client = new sdk.CopilotClient({ cwd: workDir, logLevel: "error" });
                        const session = await client.createSession({
                            model: msg.model || "claude-sonnet-4",
                            streaming: true,
                            workingDirectory: workDir,
                            onPermissionRequest: sdk.approveAll,
                        });

                        const entry = {
                            client, session, history: [],
                            config: { model: msg.model || "claude-sonnet-4", cwd: workDir },
                            createdAt: new Date().toISOString(),
                            listeners: new Set([ws]),
                            unsubscribers: [],
                        };

                        entry.unsubscribers.push(session.on("assistant.message", evt => {
                            const chunk = { type: "chat:delta", chatId, content: evt.data.content };
                            entry.listeners.forEach(l => { if (l.readyState === 1) l.send(JSON.stringify(chunk)); });
                        }));

                        entry.unsubscribers.push(session.on("session.idle", () => {
                            const done = { type: "chat:done", chatId };
                            entry.listeners.forEach(l => { if (l.readyState === 1) l.send(JSON.stringify(done)); });
                        }));

                        chatSessions.set(chatId, entry);
                        ws.chatSessionId = chatId;
                        ws.send(JSON.stringify({ type: "chat:created", chatId, model: entry.config.model, cwd: workDir }));
                    } catch (err) {
                        ws.send(JSON.stringify({ type: "chat:error", error: err.message }));
                    }
                }

                if (msg.type === "chat:send") {
                    const entry = chatSessions.get(msg.chatId);
                    if (!entry) return ws.send(JSON.stringify({ type: "chat:error", error: "Session not found" }));

                    if (!msg.prompt || msg.prompt.length > 100000) {
                        return ws.send(JSON.stringify({ type: "chat:error", error: "Prompt too long (max 100KB)" }));
                    }

                    entry.history.push({ role: "user", content: msg.prompt, ts: new Date().toISOString() });
                    entry.listeners.forEach(l => {
                        if (l.readyState === 1) l.send(JSON.stringify({ type: "chat:user", chatId: msg.chatId, content: msg.prompt }));
                    });

                    let fullResponse = "";
                    const unsub = entry.session.on("assistant.message", evt => {
                        fullResponse += evt.data.content;
                    });

                    const idleUnsub = entry.session.on("session.idle", () => {
                        entry.history.push({ role: "assistant", content: fullResponse, ts: new Date().toISOString() });
                        unsub();
                        idleUnsub();
                    });

                    try {
                        await entry.session.send({ prompt: msg.prompt });
                    } catch (err) {
                        ws.send(JSON.stringify({ type: "chat:error", chatId: msg.chatId, error: err.message }));
                    }
                }

            } catch (err) {
                ws.send(JSON.stringify({ type: "chat:error", error: err.message }));
            }
        });

        ws.on("close", () => {
            if (ws.chatSessionId) {
                const entry = chatSessions.get(ws.chatSessionId);
                if (entry) entry.listeners.delete(ws);
            }
        });
    });
}

module.exports = { setupChatWs };
