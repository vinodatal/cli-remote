const { createTestDb, createTestApp } = require("../setup");

let cleanup;

beforeAll(() => {
    const db = createTestDb();
    const result = createTestApp(db);
    cleanup = result.cleanup;
});

afterAll(() => {
    cleanup();
});

describe("getDb", () => {
    it("returns a working database connection", () => {
        const { getDb } = require("../../src/lib/db");
        const db = getDb();
        const row = db.prepare("SELECT COUNT(*) as c FROM sessions").get();
        expect(row.c).toBe(3);
        db.close();
    });

    it("can query turns", () => {
        const { getDb } = require("../../src/lib/db");
        const db = getDb();
        const turns = db.prepare("SELECT * FROM turns WHERE session_id = ?").all("sess-001");
        expect(turns).toHaveLength(3);
        db.close();
    });
});
