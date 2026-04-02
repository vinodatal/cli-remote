const express = require("express");
const fs = require("fs");
const path = require("path");
const { isAllowedPath } = require("../middleware/security");

const router = express.Router();

// Read file content
router.get("/api/file", (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: "path required" });

    const resolved = path.resolve(filePath);

    if (!isAllowedPath(resolved)) return res.status(403).json({ error: "Access denied — path outside allowed directories" });
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: "File not found", path: resolved });

    try {
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) return res.status(400).json({ error: "Path is a directory" });
        if (stat.size > 5 * 1024 * 1024) return res.status(413).json({ error: "File too large (>5MB)" });

        const ext = path.extname(resolved).toLowerCase();
        const textExts = new Set([
            ".cs", ".js", ".ts", ".json", ".xml", ".yml", ".yaml", ".md", ".txt", ".html",
            ".css", ".csproj", ".sln", ".bicep", ".ps1", ".sh", ".py", ".go", ".rs", ".java",
            ".config", ".env", ".gitignore", ".editorconfig", ".props", ".targets", ".sql",
            ".bicepparam", ".log", ".csv", ".dockerfile", ".toml", ".ini", ".cfg",
        ]);
        const isText = textExts.has(ext) || ext === "";

        if (req.query.download === "true") {
            return res.download(resolved);
        }

        const content = fs.readFileSync(resolved, isText ? "utf-8" : "base64");
        res.json({
            path: resolved,
            name: path.basename(resolved),
            ext,
            size: stat.size,
            isText,
            content,
            modified: stat.mtime.toISOString(),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Download file
router.get("/api/file/download", (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: "path required" });
    const resolved = path.resolve(filePath);
    if (!isAllowedPath(resolved)) return res.status(403).json({ error: "Access denied" });
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: "File not found" });
    res.download(resolved);
});

module.exports = router;
