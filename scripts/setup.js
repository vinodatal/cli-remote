#!/usr/bin/env node

/**
 * Copilot Session Portal — Quick Setup
 * 
 * Usage:
 *   npx copilot-session-portal          # Install and start
 *   node setup.js                       # Same, from cloned repo
 *   node setup.js --tunnel              # Start with dev tunnel
 *   node setup.js --tunnel --anonymous  # Tunnel with public access
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const args = process.argv.slice(2);
const wantTunnel = args.includes("--tunnel");
const anonymous = args.includes("--anonymous");

const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function log(msg) { console.log(`${GREEN}✓${RESET} ${msg}`); }
function warn(msg) { console.log(`${YELLOW}⚠${RESET} ${msg}`); }
function fail(msg) { console.log(`${RED}✗${RESET} ${msg}`); }
function info(msg) { console.log(`${DIM}  ${msg}${RESET}`); }

console.log(`
${BLUE}╔══════════════════════════════════════════════╗
║  🤖 Copilot Session Portal — Setup            ║
╚══════════════════════════════════════════════╝${RESET}
`);

// ── Check prerequisites ──
let ok = true;

// Node.js version
const nodeVersion = parseInt(process.version.slice(1));
if (nodeVersion >= 20) {
    log(`Node.js ${process.version}`);
} else {
    fail(`Node.js ${process.version} — need v20+`);
    ok = false;
}

// Copilot CLI
try {
    const ver = execSync("copilot --version 2>&1", { encoding: "utf-8" }).trim().split("\n")[0];
    log(`Copilot CLI: ${ver}`);
} catch {
    fail("Copilot CLI not found");
    info("Install: winget install GitHub.Copilot (Windows)");
    info("         brew install copilot-cli (macOS)");
    info("         npm install -g @github/copilot (any platform)");
    ok = false;
}

// Session store
const sessionStorePath = path.join(os.homedir(), ".copilot", "session-store.db");
if (fs.existsSync(sessionStorePath)) {
    const size = (fs.statSync(sessionStorePath).size / 1024).toFixed(0);
    log(`Session store found (${size} KB)`);
} else {
    warn("No session store found — run 'copilot' at least once first");
}

if (!ok) {
    console.log(`\n${RED}Prerequisites not met. Fix the issues above and try again.${RESET}\n`);
    process.exit(1);
}

// ── Install dependencies ──
console.log("");
if (!fs.existsSync(path.join(__dirname, "node_modules"))) {
    log("Installing dependencies...");
    execSync("npm install", { cwd: __dirname, stdio: "inherit" });
} else {
    log("Dependencies already installed");
}

// ── Start server ──
console.log("");
log("Starting portal server...");

const server = spawn("node", [path.join(__dirname, "..", "src", "server.js")], {
    cwd: __dirname,
    stdio: "inherit",
    env: { ...process.env },
});

server.on("error", (err) => {
    fail(`Server failed: ${err.message}`);
    process.exit(1);
});

// ── Optional: start dev tunnel ──
if (wantTunnel) {
    setTimeout(() => {
        console.log("");
        log("Starting dev tunnel...");
        const tunnelArgs = ["host", "-p", "3456"];
        if (anonymous) tunnelArgs.push("--allow-anonymous");

        const tunnel = spawn("devtunnel", tunnelArgs, {
            stdio: "inherit",
            env: { ...process.env },
        });

        tunnel.on("error", () => {
            warn("devtunnel not found — install with: winget install Microsoft.devtunnel");
        });
    }, 2000);
}

// Graceful shutdown
process.on("SIGINT", () => {
    server.kill();
    process.exit(0);
});
