const path = require("path");
const os = require("os");

const PORT = process.env.PORT || 3456;
const SESSION_STORE_PATH = path.join(os.homedir(), ".copilot", "session-store.db");
const SESSION_STATE_DIR = path.join(os.homedir(), ".copilot", "session-state");
const MAX_SCROLLBACK = 50000;

module.exports = { PORT, SESSION_STORE_PATH, SESSION_STATE_DIR, MAX_SCROLLBACK };
