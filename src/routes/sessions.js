const express = require("express");
const fs = require("fs");
const path = require("path");
const { getDb } = require("../lib/db");
const { SESSION_STATE_DIR } = require("../lib/config");

const router = express.Router();

// Dashboard stats
router.get("/api/stats", (_req, res) => {
    const db = getDb();
    try {
        const totalSessions = db.prepare("SELECT COUNT(*) as c FROM sessions").get().c;
        const totalTurns = db.prepare("SELECT COUNT(*) as c FROM turns").get().c;
        const totalFiles = db.prepare("SELECT COUNT(DISTINCT file_path) as c FROM session_files").get().c;
        const last24h = db.prepare("SELECT COUNT(*) as c FROM sessions WHERE updated_at >= datetime('now', '-24 hours')").get().c;
        const repos = db.prepare("SELECT DISTINCT repository FROM sessions WHERE repository IS NOT NULL AND repository != ''").all().map(r => r.repository);

        let activeDirs = 0;
        if (fs.existsSync(SESSION_STATE_DIR)) {
            activeDirs = fs.readdirSync(SESSION_STATE_DIR).filter(d => fs.statSync(path.join(SESSION_STATE_DIR, d)).isDirectory()).length;
        }

        res.json({ totalSessions, totalTurns, totalFiles, last24h, activeDirs, repos });
    } finally {
        db.close();
    }
});

// List sessions
router.get("/api/sessions", (req, res) => {
    const db = getDb();
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;
        const search = req.query.search || "";

        let sql = "SELECT id, cwd, repository, branch, summary, created_at, updated_at FROM sessions";
        const params = [];

        if (search) {
            sql += " WHERE (summary LIKE ? OR repository LIKE ? OR branch LIKE ? OR cwd LIKE ?)";
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }

        sql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const sessions = db.prepare(sql).all(...params);
        const countSql = search
            ? "SELECT COUNT(*) as c FROM sessions WHERE (summary LIKE ? OR repository LIKE ? OR branch LIKE ? OR cwd LIKE ?)"
            : "SELECT COUNT(*) as c FROM sessions";
        const countParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : [];
        const total = db.prepare(countSql).get(...countParams).c;

        const enriched = sessions.map(s => ({
            ...s,
            isActive: fs.existsSync(path.join(SESSION_STATE_DIR, s.id)),
        }));

        res.json({ sessions: enriched, total });
    } finally {
        db.close();
    }
});

// Session detail
router.get("/api/sessions/:id", (req, res) => {
    const db = getDb();
    try {
        const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
        if (!session) return res.status(404).json({ error: "Not found" });

        const turnCount = db.prepare("SELECT COUNT(*) as c FROM turns WHERE session_id = ?").get(req.params.id).c;
        const fileCount = db.prepare("SELECT COUNT(DISTINCT file_path) as c FROM session_files WHERE session_id = ?").get(req.params.id).c;
        const checkpointCount = db.prepare("SELECT COUNT(*) as c FROM checkpoints WHERE session_id = ?").get(req.params.id).c;
        const refCount = db.prepare("SELECT COUNT(*) as c FROM session_refs WHERE session_id = ?").get(req.params.id).c;
        const isActive = fs.existsSync(path.join(SESSION_STATE_DIR, req.params.id));

        res.json({ ...session, turnCount, fileCount, checkpointCount, refCount, isActive });
    } finally {
        db.close();
    }
});

// Conversation turns
router.get("/api/sessions/:id/turns", (req, res) => {
    const db = getDb();
    try {
        const turns = db.prepare("SELECT turn_index, user_message, assistant_response, timestamp FROM turns WHERE session_id = ? ORDER BY turn_index").all(req.params.id);
        res.json(turns);
    } finally {
        db.close();
    }
});

// Files touched
router.get("/api/sessions/:id/files", (req, res) => {
    const db = getDb();
    try {
        const files = db.prepare("SELECT file_path, tool_name, turn_index, first_seen_at FROM session_files WHERE session_id = ? ORDER BY first_seen_at").all(req.params.id);
        res.json(files);
    } finally {
        db.close();
    }
});

// Checkpoints
router.get("/api/sessions/:id/checkpoints", (req, res) => {
    const db = getDb();
    try {
        const cps = db.prepare("SELECT checkpoint_number, title, overview, work_done, technical_details, important_files, next_steps FROM checkpoints WHERE session_id = ? ORDER BY checkpoint_number").all(req.params.id);
        res.json(cps);
    } finally {
        db.close();
    }
});

// Refs (commits, PRs, issues)
router.get("/api/sessions/:id/refs", (req, res) => {
    const db = getDb();
    try {
        const refs = db.prepare("SELECT ref_type, ref_value, turn_index, created_at FROM session_refs WHERE session_id = ? ORDER BY created_at").all(req.params.id);
        res.json(refs);
    } finally {
        db.close();
    }
});

// Active session-state directories
router.get("/api/active-sessions", (_req, res) => {
    if (!fs.existsSync(SESSION_STATE_DIR)) return res.json([]);

    const db = getDb();
    try {
        const dirs = fs.readdirSync(SESSION_STATE_DIR).filter(d => {
            try { return fs.statSync(path.join(SESSION_STATE_DIR, d)).isDirectory(); } catch { return false; }
        });

        const active = dirs.map(id => {
            const session = db.prepare("SELECT id, cwd, repository, branch, summary, created_at, updated_at FROM sessions WHERE id = ?").get(id);
            const stateDir = path.join(SESSION_STATE_DIR, id);
            const hasLocalDb = fs.existsSync(path.join(stateDir, "session.db"));
            const hasPlan = fs.existsSync(path.join(stateDir, "plan.md"));
            let lastModified;
            try { lastModified = fs.statSync(stateDir).mtime.toISOString(); } catch { lastModified = null; }

            return { id, ...(session || {}), hasLocalDb, hasPlan, lastModified };
        });

        active.sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
        res.json(active);
    } finally {
        db.close();
    }
});

module.exports = router;
