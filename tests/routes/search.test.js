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

describe("GET /api/search", () => {
    it("returns empty array without q", async () => {
        const res = await request(app).get("/api/search");
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it("returns results with q", async () => {
        const res = await request(app).get("/api/search?q=auth");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body[0]).toHaveProperty("session_id");
        expect(res.body[0]).toHaveProperty("content");
    });
});
