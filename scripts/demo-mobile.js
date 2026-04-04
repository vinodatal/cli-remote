const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "docs", "demo");
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        recordVideo: { dir: DIR, size: { width: 393, height: 852 } },
        colorScheme: "dark",
    });
    const page = await ctx.newPage();

    // Caption overlay
    await page.addInitScript(`
        window.addEventListener("DOMContentLoaded", () => {
            const s = document.createElement("style");
            s.textContent = "#__c__{position:fixed;top:40px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;font-family:-apple-system,sans-serif;z-index:2147483646;pointer-events:none;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);display:none}";
            document.head.appendChild(s);
            const c = document.createElement("div"); c.id="__c__"; document.body.appendChild(c);
        });
    `);

    async function cap(text, ms) {
        ms = ms || 2500;
        await page.evaluate(([t,d]) => { const e=document.getElementById("__c__"); e.textContent=t; e.style.display="block"; setTimeout(()=>{e.style.display="none"},d); }, [text, ms]);
        await sleep(400);
    }

    console.log("📱 Recording mobile demo...\n");

    // 1. Session list
    console.log("  1/5 Session list");
    await page.goto("http://localhost:3456");
    await page.waitForSelector(".session-item", { timeout: 10000 });
    await cap("📱 Mobile Session List");
    await sleep(3000);
    await page.screenshot({ path: path.join(DIR, "mobile-list.png") });

    // 2. Session detail
    console.log("  2/5 Session detail");
    await cap("📋 Tap to view details");
    await page.click(".session-item");
    await page.waitForSelector(".detail-header", { timeout: 5000 });
    await sleep(3000);
    await page.screenshot({ path: path.join(DIR, "mobile-detail.png") });

    // 3. Terminal
    console.log("  3/5 Terminal + touch bar");
    await cap("⌨ Open Terminal");
    const btn = await page.$(".copilot-launch-btn.shell");
    if (btn) await btn.click();
    await sleep(4000);
    await page.screenshot({ path: path.join(DIR, "mobile-terminal.png") });

    // 4. Font size
    console.log("  4/5 Font size");
    await cap("🔤 Adjust Font Size");
    await page.click("#termFontDown").catch(() => {});
    await sleep(500);
    await page.click("#termFontDown").catch(() => {});
    await sleep(3000);
    await page.screenshot({ path: path.join(DIR, "mobile-font.png") });

    // 5. Maximize
    console.log("  5/5 Maximize");
    await cap("▲ Full Screen");
    await page.click("#termMinMax").catch(() => {});
    await sleep(3000);
    await page.screenshot({ path: path.join(DIR, "mobile-maximized.png") });

    await sleep(1000);
    await ctx.close();
    await browser.close();

    // Rename video
    const vids = fs.readdirSync(DIR).filter(f => f.endsWith(".webm") && !["demo.webm","mobile-demo.webm"].includes(f));
    if (vids.length > 0) {
        const dest = path.join(DIR, "mobile-demo.webm");
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        fs.renameSync(path.join(DIR, vids[vids.length - 1]), dest);
    }
    console.log("\n✅ docs/demo/mobile-demo.webm\nDone!");
}

main().catch(err => { console.error("Failed:", err.message); process.exit(1); });
