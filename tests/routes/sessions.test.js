const request = require("supertest");
const { createTestDb, createTestApp } = require("../setup");

let app, cleanup;

beforeAll(() => {
    const db = createTestDb();
    const result = createTestApp(db);
    app = result.app;
    cleanup = result.cleanup;
});

afterAll(() => {
    cleanup();
});

describe("GET /api/stats", () => {
    it("returns expected counts", async () => {
        const res = await request(app).get("/api/stats");
        expect(res.status).toBe(200);
        expect(res.body.totalSessions).toBe(3);
        expect(res.body.totalTurns).toBe(5);
        expect(res.body.totalFiles).toBe(4);
        expect(res.body).toHaveProperty("last24h");
        expect(res.body).toHaveProperty("activeDirs");
        expect(res.body).toHaveProperty("repos");
    });
});

describe("GET /api/sessions", () => {
    it("returns sessions with pagination", async () => {
        const res = await request(app).get("/api/sessions");
        expect(res.status).toBe(200);
        expect(res.body.sessions).toHaveLength(3);
        expect(res.body.total).toBe(3);
        expect(res.body.sessions[0]).toHaveProperty("id");
        expect(res.body.sessions[0]).toHaveProperty("summary");
    });

    it("filters results with search", async () => {
        const res = await request(app).get("/api/sessions?search=alpha");
        expect(res.status).toBe(200);
        expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
        expect(res.body.sessions.every(s =>
            s.summary?.includes("alpha") ||
            s.repository?.includes("alpha") ||
            s.branch?.includes("alpha") ||
            s.cwd?.includes("alpha")
        )).toBe(true);
    });

    it("respects limit and offset", async () => {
        const res = await request(app).get("/api/sessions?limit=1&offset=0");
        expect(res.status).toBe(200);
        expect(res.body.sessions).toHaveLength(1);
        expect(res.body.total).toBe(3);
    });
});

describe("GET /api/sessions/:id", () => {
    it("returns session detail", async () => {
        const res = await request(app).get("/api/sessions/sess-001");
        expect(res.status).toBe(200);
        expect(res.body.id).toBe("sess-001");
        expect(res.body.turnCount).toBe(3);
        expect(res.body.fileCount).toBe(3);
        expect(res.body.checkpointCount).toBe(2);
        expect(res.body.refCount).toBe(2);
        expect(res.body).toHaveProperty("isActive");
    });

    it("returns 404 for unknown ID", async () => {
        const res = await request(app).get("/api/sessions/nonexistent");
        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Not found");
    });
});

describe("GET /api/sessions/:id/turns", () => {
    it("returns turns in order", async () => {
        const res = await request(app).get("/api/sessions/sess-001/turns");
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(3);
        expect(res.body[0].turn_index).toBe(0);
        expect(res.body[1].turn_index).toBe(1);
        expect(res.body[2].turn_index).toBe(2);
        expect(res.body[0]).toHaveProperty("user_message");
        expect(res.body[0]).toHaveProperty("assistant_response");
    });
});

describe("GET /api/sessions/:id/files", () => {
    it("returns files for session", async () => {
        const res = await request(app).get("/api/sessions/sess-001/files");
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(3);
        expect(res.body[0]).toHaveProperty("file_path");
        expect(res.body[0]).toHaveProperty("tool_name");
    });
});

describe("GET /api/sessions/:id/checkpoints", () => {
    it("returns checkpoints for session", async () => {
        const res = await request(app).get("/api/sessions/sess-001/checkpoints");
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].checkpoint_number).toBe(1);
        expect(res.body[0]).toHaveProperty("title");
        expect(res.body[0]).toHaveProperty("overview");
    });
});

describe("GET /api/sessions/:id/refs", () => {
    it("returns refs for session", async () => {
        const res = await request(app).get("/api/sessions/sess-001/refs");
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0]).toHaveProperty("ref_type");
        expect(res.body[0]).toHaveProperty("ref_value");
    });
});
