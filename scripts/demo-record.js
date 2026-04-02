/**
 * Copilot Session Portal — Automated Demo Recording
 * 
 * Generates screenshots and a video walkthrough of the portal.
 * 
 * Usage: node demo-record.js
 * Output: docs/demo/ directory with screenshots + demo.webm video
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:3456";
const OUTPUT_DIR = path.join(__dirname, "..", "docs", "demo");

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordVideo: { dir: OUTPUT_DIR, size: { width: 1440, height: 900 } },
        colorScheme: "dark",
    });

    const page = await context.newPage();

    console.log("📸 Recording demo...\n");

    // ── 1. Dashboard (dark) ──
    console.log("  1/9  Dashboard overview (dark)");
    await page.goto(BASE_URL);
    await page.waitForSelector(".stat-value");
    await sleep(1500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "01-dashboard.png") });

    // ── 2. Search sessions ──
    console.log("  2/9  Searching sessions");
    await page.fill("#globalSearch", "SecurityMarketplace");
    await sleep(1500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "02-search.png") });
    await page.fill("#globalSearch", "");
    await sleep(500);

    // ── 3. Select a session ──
    console.log("  3/9  Session detail view");
    const firstSession = await page.$(".session-item");
    if (firstSession) {
        await firstSession.click();
        await page.waitForSelector(".detail-header");
        await sleep(1500);
        await page.screenshot({ path: path.join(OUTPUT_DIR, "03-session-detail.png") });
    }

    // ── 4. Conversation with markdown ──
    console.log("  4/9  Conversation (markdown)");
    await sleep(1000);
    const conversationTab = await page.$('.tab[data-tab="conversation"]');
    if (conversationTab) {
        await conversationTab.click();
        await sleep(2000);
        await page.screenshot({ path: path.join(OUTPUT_DIR, "04-conversation.png") });
    }

    // ── 5. Files tab ──
    console.log("  5/9  Files tab");
    const filesTab = await page.$('.tab[data-tab="files"]');
    if (filesTab) {
        await filesTab.click();
        await sleep(1500);
        await page.screenshot({ path: path.join(OUTPUT_DIR, "05-files.png") });
    }

    // ── 6. Checkpoints tab ──
    console.log("  6/9  Checkpoints tab");
    const checkpointsTab = await page.$('.tab[data-tab="checkpoints"]');
    if (checkpointsTab) {
        await checkpointsTab.click();
        await sleep(1500);
        await page.screenshot({ path: path.join(OUTPUT_DIR, "06-checkpoints.png") });
    }

    // ── 7. Light theme ──
    console.log("  7/9  Light theme toggle");
    const themeBtn = await page.$("#themeToggle");
    if (themeBtn) {
        await themeBtn.click();
        await sleep(1500);
        // Go back to dashboard for light screenshot
        if (conversationTab) await conversationTab.click();
        await sleep(1000);
        await page.screenshot({ path: path.join(OUTPUT_DIR, "07-light-theme.png") });
        // Switch back to dark
        await themeBtn.click();
        await sleep(500);
    }

    // ── 8. Open a shell terminal tab ──
    console.log("  8/9  Terminal panel");
    const shellBtn = await page.$("#terminalBtn");
    if (shellBtn) {
        await shellBtn.click();
        await sleep(2500);
        await page.screenshot({ path: path.join(OUTPUT_DIR, "08-terminal.png") });
    }

    // ── 9. Open second tab (copilot) ──
    console.log("  9/9  Multi-tab terminal");
    const copilotPlusBtn = await page.$("#termNewCopilot");
    if (copilotPlusBtn) {
        await copilotPlusBtn.click();
        await sleep(2500);
        await page.screenshot({ path: path.join(OUTPUT_DIR, "09-multi-tab.png") });
    }

    await sleep(1000);

    // Finalize
    await context.close();

    // Rename video file
    const videos = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".webm"));
    if (videos.length > 0) {
        const src = path.join(OUTPUT_DIR, videos[videos.length - 1]);
        const dest = path.join(OUTPUT_DIR, "demo.webm");
        if (src !== dest) fs.renameSync(src, dest);
        console.log(`\n✅ Video: docs/demo/demo.webm`);
    }

    const pngs = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".png"));
    console.log(`✅ Screenshots: ${pngs.length} files in docs/demo/`);
    pngs.forEach(f => console.log(`   📸 ${f}`));

    await browser.close();

    console.log(`\nDone! Use these in your README:\n`);
    console.log(`  ![Dashboard](docs/demo/01-dashboard.png)`);
    console.log(`  ![Conversation](docs/demo/04-conversation.png)`);
    console.log(`  ![Files](docs/demo/05-files.png)\n`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error("Failed:", err.message); process.exit(1); });
