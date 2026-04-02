const express = require("express");
const { getDb } = require("../lib/db");

const router = express.Router();

// Full-text search
router.get("/api/search", (req, res) => {
    const q = req.query.q;
    if (!q) return res.json([]);

    const db = getDb();
    try {
        const results = db.prepare(`
            SELECT content, session_id, source_type, source_id
            FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 30
        `).all(q);
        res.json(results);
    } finally {
        db.close();
    }
});

module.exports = router;
