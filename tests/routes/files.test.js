const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createTestDb, createTestApp } = require("../setup");

let app, cleanup;

// Create a temp file in a directory that the test DB considers "allowed"
const testDir = path.join(os.tmpdir(), `test-files-${Date.now()}`);
const testFilePath = path.join(testDir, "test-file.txt");
const testFileContent = "Hello, this is test content.";

beforeAll(() => {
    // Create test file
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFilePath, testFileContent, "utf-8");

    // Create test DB with cwd pointing to our test dir
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    db.exec(`
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY, cwd TEXT, repository TEXT, branch TEXT,
            summary TEXT, created_at TEXT, updated_at TEXT
        );
        CREATE TABLE turns (
            session_id TEXT, turn_index INTEGER, user_message TEXT,
            assistant_response TEXT, timestamp TEXT
        );
        CREATE TABLE session_files (
            session_id TEXT, file_path TEXT, tool_name TEXT,
            turn_index INTEGER, first_seen_at TEXT
        );
        CREATE TABLE checkpoints (
            session_id TEXT, checkpoint_number INTEGER, title TEXT,
            overview TEXT, work_done TEXT, technical_details TEXT,
            important_files TEXT, next_steps TEXT
        );
        CREATE TABLE session_refs (
            session_id TEXT, ref_type TEXT, ref_value TEXT,
            turn_index INTEGER, created_at TEXT
        );
        CREATE VIRTUAL TABLE search_index USING fts5(
            content, session_id, source_type, source_id
        );
    `);
    // Insert session with cwd = testDir so isAllowedPath works
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "sess-files", testDir, "org/test", "main", "File test", "2025-01-01T10:00:00Z", "2025-01-01T12:00:00Z"
    );

    const result = createTestApp(db);
    app = result.app;
    cleanup = result.cleanup;
});

afterAll(() => {
    cleanup();
    try { fs.rmSync(testDir, { recursive: true }); } catch { /* ignore */ }
});

describe("GET /api/file", () => {
    it("returns 400 without path", async () => {
        const res = await request(app).get("/api/file");
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("path required");
    });

    it("returns file content with valid path", async () => {
        const res = await request(app).get(`/api/file?path=${encodeURIComponent(testFilePath)}`);
        expect(res.status).toBe(200);
        expect(res.body.content).toBe(testFileContent);
        expect(res.body.name).toBe("test-file.txt");
        expect(res.body.isText).toBe(true);
    });

    it("returns 403 for path outside allowed directories", async () => {
        // Use a path guaranteed to be outside session cwds
        const outsidePath = path.join(os.tmpdir(), "definitely-not-allowed", "secret.txt");
        const res = await request(app).get(`/api/file?path=${encodeURIComponent(outsidePath)}`);
        expect(res.status).toBe(403);
    });

    it("returns 404 for nonexistent path", async () => {
        const missingPath = path.join(testDir, "nonexistent.txt");
        const res = await request(app).get(`/api/file?path=${encodeURIComponent(missingPath)}`);
        expect(res.status).toBe(404);
    });
});

describe("GET /api/file/download", () => {
    it("downloads file with valid path", async () => {
        const res = await request(app).get(`/api/file/download?path=${encodeURIComponent(testFilePath)}`);
        expect(res.status).toBe(200);
        expect(res.text).toBe(testFileContent);
    });
});
