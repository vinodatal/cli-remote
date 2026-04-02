const express = require("express");
const { listPTYs, createPTY, deletePTY } = require("../lib/pty-manager");

const router = express.Router();

// List persistent PTYs
router.get("/api/ptys", (_req, res) => {
    res.json(listPTYs());
});

// Create a persistent PTY
router.post("/api/ptys", (req, res) => {
    try {
        const result = createPTY(req.body || {});
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Kill a PTY
router.delete("/api/ptys/:id", (req, res) => {
    const result = deletePTY(req.params.id);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
});

// Legacy alias
router.get("/api/terminals", (_req, res) => {
    res.json(listPTYs());
});

module.exports = router;
