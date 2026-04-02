const { getDb } = require("../lib/db");

function setupUpdatesWs(wss) {
    const turnCounts = new Map();
    let lastSessionCount = 0;

    function broadcast(data) {
        const msg = JSON.stringify(data);
        wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
    }

    wss.on("connection", ws => {
        ws.send(JSON.stringify({ type: "connected", ts: new Date().toISOString() }));
    });

    // Poll for new turns and broadcast
    const turnPoller = setInterval(() => {
        let db;
        try {
            db = getDb();
            const recent = db.prepare(`
                SELECT s.id, COUNT(t.turn_index) as tc
                FROM sessions s JOIN turns t ON t.session_id = s.id
                WHERE s.updated_at >= datetime('now', '-1 hour')
                GROUP BY s.id
            `).all();

            for (const r of recent) {
                const prev = turnCounts.get(r.id) || 0;
                if (r.tc > prev) {
                    const newTurns = db.prepare(`
                        SELECT turn_index, user_message, assistant_response, timestamp
                        FROM turns WHERE session_id = ? AND turn_index >= ? ORDER BY turn_index
                    `).all(r.id, prev);

                    broadcast({ type: "session:turns", sessionId: r.id, turns: newTurns, totalTurns: r.tc });
                }
                turnCounts.set(r.id, r.tc);
            }
        } catch { /* ignore */ }
        finally { try { db?.close(); } catch { /* ignore */ } }
    }, 3000);

    // Poll for session count changes
    const sessionPoller = setInterval(() => {
        let db;
        try {
            db = getDb();
            const count = db.prepare("SELECT COUNT(*) as c FROM sessions").get().c;
            if (count !== lastSessionCount) {
                lastSessionCount = count;
                broadcast({ type: "sessions_updated", count });
            }
        } catch { /* ignore */ }
        finally { try { db?.close(); } catch { /* ignore */ } }
    }, 5000);

    return { turnPoller, sessionPoller, broadcast };
}

module.exports = { setupUpdatesWs };
