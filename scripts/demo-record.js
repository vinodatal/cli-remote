/**
 * Copilot Session Portal — Automated Demo Recording
 * 
 * Generates screenshots and a video walkthrough of the portal.
 * 
 * Usage: node scripts/demo-record.js
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

    // ── 1. Dashboard (dark, stats hidden) ──
    console.log("  1/11  Dashboard overview");
    await page.goto(BASE_URL);
    await page.waitForSelector(".session-item", { timeout: 10000 });
    await sleep(1500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "01-dashboard.png") });

    // ── 2. Toggle stats bar ──
    console.log("  2/11  Stats bar toggle");
    await page.click("#statsToggle");
    await sleep(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "02-stats.png") });
    await page.click("#statsToggle"); // hide again
    await sleep(500);

    // ── 3. Search sessions ──
    console.log("  3/11  Search sessions");
    await page.fill("#globalSearch", "SecurityMarketplace");
    await sleep(1500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "03-search.png") });
    await page.fill("#globalSearch", "");
    await sleep(500);

    // ── 4. Session detail ──
    console.log("  4/11  Session detail");
    const firstSession = await page.$(".session-item");
    if (firstSession) {
        await firstSession.click();
        await page.waitForSelector(".detail-header", { timeout: 5000 });
        await sleep(1500);
        await page.screenshot({ path: path.join(OUTPUT_DIR, "04-session-detail.png") });
    }

    // ── 5. Conversation (markdown) ──
    console.log("  5/11  Conversation");
    const convTab = await page.$('.tab[data-tab="conversation"]');
    if (convTab) { await convTab.click(); await sleep(2000); }
    await page.screenshot({ path: path.join(OUTPUT_DIR, "05-conversation.png") });

    // ── 6. Files tab ──
    console.log("  6/11  Files tab");
    const filesTab = await page.$('.tab[data-tab="files"]');
    if (filesTab) { await filesTab.click(); await sleep(1500); }
    await page.screenshot({ path: path.join(OUTPUT_DIR, "06-files.png") });

    // ── 7. Collapse sidebar ──
    console.log("  7/11  Sidebar collapsed");
    await page.click("#sidebarToggle");
    await sleep(800);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "07-sidebar-collapsed.png") });
    await page.click("#sidebarToggle"); // restore
    await sleep(500);

    // ── 8. Light theme ──
    console.log("  8/11  Light theme");
    await page.click("#themeToggle");
    await sleep(1500);
    if (convTab) { await convTab.click(); await sleep(1000); }
    await page.screenshot({ path: path.join(OUTPUT_DIR, "08-light-theme.png") });
    await page.click("#themeToggle"); // back to dark
    await sleep(500);

    // ── 9. Open shell terminal ──
    console.log("  9/11  Terminal panel");
    await page.click("#terminalBtn");
    await sleep(3000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "09-terminal.png") });

    // ── 10. Open second tab ──
    console.log("  10/11 Multi-tab terminal");
    await page.click("#termNewCopilot");
    await sleep(3000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "10-multi-tab.png") });

    // ── 11. Maximize terminal ──
    console.log("  11/11 Maximized terminal");
    await page.click("#termMinMax");
    await sleep(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "11-maximized.png") });

    await sleep(1000);
    await context.close();

    // Rename video
    const videos = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".webm"));
    if (videos.length > 0) {
        const src = path.join(OUTPUT_DIR, videos[videos.length - 1]);
        const dest = path.join(OUTPUT_DIR, "demo.webm");
        if (src !== dest && fs.existsSync(dest)) fs.unlinkSync(dest);
        if (src !== dest) fs.renameSync(src, dest);
        console.log(`\n✅ Video: docs/demo/demo.webm`);
    }

    const pngs = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".png"));
    console.log(`✅ Screenshots: ${pngs.length} files in docs/demo/`);
    pngs.forEach(f => console.log(`   📸 ${f}`));

    await browser.close();
    console.log("\nDone!\n");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error("Failed:", err.message); process.exit(1); });
