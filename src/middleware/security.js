const path = require("path");
const { getDb } = require("../lib/db");
const { SESSION_STATE_DIR } = require("../lib/config");

function isAllowedPath(filePath) {
    const resolved = path.resolve(filePath);
    const db = getDb();
    try {
        const cwds = db.prepare("SELECT DISTINCT cwd FROM sessions WHERE cwd IS NOT NULL").all().map(r => r.cwd);
        cwds.push(SESSION_STATE_DIR);
        return cwds.some(cwd => resolved.startsWith(path.resolve(cwd)));
    } finally {
        db.close();
    }
}

module.exports = { isAllowedPath };
