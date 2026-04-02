const Database = require("better-sqlite3");
const { setDbOverride } = require("../src/lib/db");

function createTestDb() {
    const db = new Database(":memory:");

    // Create schema matching session-store.db
    db.exec(`
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            cwd TEXT,
            repository TEXT,
            branch TEXT,
            summary TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE turns (
            session_id TEXT,
            turn_index INTEGER,
            user_message TEXT,
            assistant_response TEXT,
            timestamp TEXT,
            PRIMARY KEY (session_id, turn_index)
        );

        CREATE TABLE session_files (
            session_id TEXT,
            file_path TEXT,
            tool_name TEXT,
            turn_index INTEGER,
            first_seen_at TEXT
        );

        CREATE TABLE checkpoints (
            session_id TEXT,
            checkpoint_number INTEGER,
            title TEXT,
            overview TEXT,
            work_done TEXT,
            technical_details TEXT,
            important_files TEXT,
            next_steps TEXT,
            PRIMARY KEY (session_id, checkpoint_number)
        );

        CREATE TABLE session_refs (
            session_id TEXT,
            ref_type TEXT,
            ref_value TEXT,
            turn_index INTEGER,
            created_at TEXT
        );

        CREATE VIRTUAL TABLE search_index USING fts5(
            content,
            session_id,
            source_type,
            source_id
        );
    `);

    // Insert fixture data: 3 sessions
    db.prepare(`INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        "sess-001", "/projects/alpha", "org/alpha", "main", "Implement auth module", "2025-01-01T10:00:00Z", "2025-01-01T12:00:00Z"
    );
    db.prepare(`INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        "sess-002", "/projects/beta", "org/beta", "feature/search", "Add search feature", "2025-01-02T08:00:00Z", "2025-01-02T10:00:00Z"
    );
    db.prepare(`INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        "sess-003", "/projects/gamma", "org/gamma", "fix/bug-123", "Fix login bug", "2025-01-03T14:00:00Z", "2025-01-03T16:00:00Z"
    );

    // Insert fixture data: 5 turns
    const insertTurn = db.prepare(`INSERT INTO turns VALUES (?, ?, ?, ?, ?)`);
    insertTurn.run("sess-001", 0, "Create auth module", "I'll create the auth module...", "2025-01-01T10:01:00Z");
    insertTurn.run("sess-001", 1, "Add JWT support", "Adding JWT token generation...", "2025-01-01T10:05:00Z");
    insertTurn.run("sess-001", 2, "Write tests", "Writing unit tests for auth...", "2025-01-01T10:10:00Z");
    insertTurn.run("sess-002", 0, "Implement search", "Setting up search endpoint...", "2025-01-02T08:01:00Z");
    insertTurn.run("sess-003", 0, "Fix the login bug", "Looking at the login flow...", "2025-01-03T14:01:00Z");

    // Insert fixture data: 4 files
    const insertFile = db.prepare(`INSERT INTO session_files VALUES (?, ?, ?, ?, ?)`);
    insertFile.run("sess-001", "/projects/alpha/src/auth.js", "edit", 0, "2025-01-01T10:02:00Z");
    insertFile.run("sess-001", "/projects/alpha/src/jwt.js", "create", 1, "2025-01-01T10:06:00Z");
    insertFile.run("sess-001", "/projects/alpha/tests/auth.test.js", "create", 2, "2025-01-01T10:11:00Z");
    insertFile.run("sess-002", "/projects/beta/src/search.js", "create", 0, "2025-01-02T08:02:00Z");

    // Insert fixture data: 2 checkpoints
    const insertCp = db.prepare(`INSERT INTO checkpoints VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertCp.run("sess-001", 1, "Auth module complete", "Implemented JWT auth", "Created auth and JWT modules", "Used bcrypt for hashing", "auth.js, jwt.js", "Add refresh tokens");
    insertCp.run("sess-001", 2, "Tests passing", "All tests green", "Wrote 5 unit tests", "MSTest framework", "auth.test.js", "Deploy to staging");

    // Insert fixture data: 2 refs
    const insertRef = db.prepare(`INSERT INTO session_refs VALUES (?, ?, ?, ?, ?)`);
    insertRef.run("sess-001", "commit", "abc123", 2, "2025-01-01T10:15:00Z");
    insertRef.run("sess-001", "pr", "42", 2, "2025-01-01T10:16:00Z");

    // Insert search index data
    const insertSearch = db.prepare(`INSERT INTO search_index VALUES (?, ?, ?, ?)`);
    insertSearch.run("Implement auth module with JWT", "sess-001", "turn", "0");
    insertSearch.run("Search feature implementation", "sess-002", "turn", "0");

    return db;
}

function createTestApp(db) {
    // Point the shared getDb() at our in-memory DB path
    // We use a temp file since better-sqlite3 in-memory DBs can't be shared across connections
    const os = require("os");
    const path = require("path");
    const fs = require("fs");

    const tmpDbPath = path.join(os.tmpdir(), `test-session-store-${Date.now()}.db`);

    // Serialize in-memory DB to file
    const buffer = db.serialize();
    fs.writeFileSync(tmpDbPath, buffer);
    db.close();

    // Override the DB helper to use our test DB file
    setDbOverride(tmpDbPath, { readonly: true });

    // Now create the app
    const { createApp } = require("../src/app");
    const { app, server } = createApp();

    // Return cleanup function
    function cleanup() {
        clearInterval(app._pollers.turnPoller);
        clearInterval(app._pollers.sessionPoller);
        server.close();
        try { fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
    }

    return { app, server, cleanup, tmpDbPath };
}

module.exports = { createTestDb, createTestApp };
