const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const sessionsRouter = require("./routes/sessions");
const filesRouter = require("./routes/files");
const searchRouter = require("./routes/search");
const ptysRouter = require("./routes/ptys");
const chatRouter = require("./routes/chat");
const { setupUpdatesWs } = require("./ws/updates");
const { setupTerminalWs } = require("./ws/terminal");
const { setupChatWs } = require("./ws/chat");

function createApp() {
    const app = express();
    const server = http.createServer(app);

    // WebSocket servers
    const wss = new WebSocketServer({ noServer: true });
    const termWss = new WebSocketServer({ noServer: true });
    const chatWss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (url.pathname === "/ws/terminal") {
            termWss.handleUpgrade(req, socket, head, ws => termWss.emit("connection", ws, req));
        } else if (url.pathname === "/ws/chat") {
            chatWss.handleUpgrade(req, socket, head, ws => chatWss.emit("connection", ws, req));
        } else {
            wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
        }
    });

    // Middleware
    // Security headers
    app.use((_req, res, next) => {
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-XSS-Protection", "1; mode=block");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        next();
    });
    app.use(express.static(path.join(__dirname, "..", "public")));
    app.use(express.json({ limit: "100kb" }));

    // Routes
    app.use(sessionsRouter);
    app.use(filesRouter);
    app.use(searchRouter);
    app.use(ptysRouter);
    app.use(chatRouter);

    // WebSocket handlers
    const { turnPoller, sessionPoller } = setupUpdatesWs(wss);
    setupTerminalWs(termWss);
    setupChatWs(chatWss);

    // SPA fallback
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

    // Expose for cleanup
    app._pollers = { turnPoller, sessionPoller };

    return { app, server };
}

module.exports = { createApp };
