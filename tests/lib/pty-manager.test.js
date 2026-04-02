const { createTestDb, createTestApp } = require("../setup");

// PTY tests require node-pty and a real terminal — skip on CI
const isCI = process.env.CI === "true" || process.env.CI === "1";

let cleanup;

beforeAll(() => {
    const db = createTestDb();
    const result = createTestApp(db);
    cleanup = result.cleanup;
});

afterAll(() => {
    cleanup();
});

describe.skipIf(isCI)("pty-manager", () => {
    let ptyManager;

    beforeEach(() => {
        ptyManager = require("../../src/lib/pty-manager");
    });

    it("listPTYs returns empty array initially", () => {
        // Clear any leftover PTYs
        ptyManager.activePTYs.clear();
        const ptys = ptyManager.listPTYs();
        expect(ptys).toEqual([]);
    });

    it("createPTY creates a shell process", () => {
        ptyManager.activePTYs.clear();
        const result = ptyManager.createPTY({ command: "shell" });
        expect(result).toHaveProperty("ptyId");
        expect(result).toHaveProperty("pid");
        expect(result).toHaveProperty("cwd");
        expect(ptyManager.listPTYs()).toHaveLength(1);

        // Cleanup
        ptyManager.deletePTY(result.ptyId);
    });

    it("deletePTY removes a PTY", () => {
        ptyManager.activePTYs.clear();
        const result = ptyManager.createPTY({ command: "shell" });
        expect(ptyManager.listPTYs()).toHaveLength(1);

        const deleteResult = ptyManager.deletePTY(result.ptyId);
        expect(deleteResult).toEqual({ ok: true });
        expect(ptyManager.listPTYs()).toHaveLength(0);
    });

    it("deletePTY returns null for nonexistent PTY", () => {
        const result = ptyManager.deletePTY("nonexistent");
        expect(result).toBeNull();
    });

    it("createPTY with invalid cwd falls back to USERPROFILE", () => {
        ptyManager.activePTYs.clear();
        const result = ptyManager.createPTY({ command: "shell", cwd: "/nonexistent/path/xyz" });
        expect(result).toHaveProperty("ptyId");
        expect(result.cwd).not.toBe("/nonexistent/path/xyz");

        // Cleanup
        ptyManager.deletePTY(result.ptyId);
    });
});
