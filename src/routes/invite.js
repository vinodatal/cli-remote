const express = require("express");
const { execSync } = require("child_process");

const router = express.Router();

const REPO = process.env.INVITE_REPO || "vinodata_microsoft/copilot-session-portal";
const PERMISSION = "push"; // write access

// Serve invite page
router.get("/invite", (_req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copilot Session Portal — Get Access</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 40px; max-width: 440px; width: 100%; text-align: center; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        .logo { font-size: 48px; margin-bottom: 16px; }
        p { color: #8b949e; font-size: 14px; margin-bottom: 24px; line-height: 1.6; }
        input { width: 100%; padding: 12px 16px; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 8px; font-size: 14px; margin-bottom: 12px; outline: none; }
        input:focus { border-color: #58a6ff; }
        input::placeholder { color: #6e7681; }
        button { width: 100%; padding: 12px; background: #238636; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        button:hover { background: #2ea043; }
        button:disabled { opacity: 0.5; cursor: default; }
        .result { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 13px; display: none; }
        .result.success { display: block; background: #23863622; color: #3fb950; border: 1px solid #238636; }
        .result.error { display: block; background: #f8514922; color: #f85149; border: 1px solid #f85149; }
        .hint { font-size: 12px; color: #6e7681; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">🤖</div>
        <h1>Copilot Session Portal</h1>
        <p>Access your GitHub Copilot CLI sessions from any device.<br>Enter your GitHub username to get access.</p>
        <form id="inviteForm">
            <input type="text" id="username" placeholder="GitHub username (e.g. alias_microsoft)" required autocomplete="off" autofocus>
            <button type="submit" id="submitBtn">Request Access</button>
        </form>
        <div id="result" class="result"></div>
        <p class="hint">After approval, check your email for a GitHub invitation link.</p>
    </div>
    <script>
        document.getElementById("inviteForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = document.getElementById("submitBtn");
            const result = document.getElementById("result");
            const username = document.getElementById("username").value.trim();
            if (!username) return;
            btn.disabled = true; btn.textContent = "Adding...";
            result.className = "result"; result.style.display = "none";
            try {
                const r = await fetch("/api/invite", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username }),
                });
                const data = await r.json();
                if (r.ok) {
                    result.className = "result success";
                    result.textContent = "✅ " + data.message;
                    result.style.display = "block";
                } else {
                    result.className = "result error";
                    result.textContent = "❌ " + (data.error || "Failed");
                    result.style.display = "block";
                }
            } catch (err) {
                result.className = "result error";
                result.textContent = "❌ Network error: " + err.message;
                result.style.display = "block";
            }
            btn.disabled = false; btn.textContent = "Request Access";
        });
    </script>
</body>
</html>`);
});

// API: add collaborator
router.post("/api/invite", (req, res) => {
    const { username } = req.body;
    if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.status(400).json({ error: "Invalid username" });
    }

    try {
        const result = execSync(
            `gh api repos/${REPO}/collaborators/${username} -X PUT -f permission=${PERMISSION} 2>&1`,
            { encoding: "utf-8", timeout: 15000 }
        );
        res.json({ message: `Invitation sent to ${username}. Check your GitHub email to accept.` });
    } catch (err) {
        const output = err.stdout || err.stderr || err.message;
        if (output.includes("404")) {
            res.status(404).json({ error: `User "${username}" not found on GitHub` });
        } else if (output.includes("422")) {
            res.json({ message: `${username} already has access!` });
        } else {
            res.status(500).json({ error: `Failed to add: ${output.slice(0, 200)}` });
        }
    }
});

module.exports = router;
