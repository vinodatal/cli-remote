/**
 * Copilot Session Portal — Professional Demo with Voice Narration
 * 
 * Generates a narrated video walkthrough with:
 * - Custom cursor + click ripple
 * - Caption overlays
 * - AI voice narration (Edge TTS neural voice)
 * - Final merged video via ffmpeg
 * 
 * Usage: node scripts/demo-record.js
 * Output: docs/demo/
 */

const { chromium } = require("playwright");
const { EdgeTTS } = require("@andresaya/edge-tts");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:3456";
const OUTPUT_DIR = path.join(__dirname, "..", "docs", "demo");
const AUDIO_DIR = path.join(OUTPUT_DIR, "audio");
const VOICE = "en-US-GuyNeural"; // Professional male voice

// Scene definitions: narration + action
const SCENES = [
    { id: "01", narration: "Welcome to the Copilot Session Portal. A remote dashboard to access your GitHub Copilot CLI sessions from any device.", action: "dashboard" },
    { id: "02", narration: "Toggle the stats panel to see total sessions, turns, and files at a glance.", action: "stats" },
    { id: "03", narration: "Search across all sessions instantly. Filter by repo, branch, or summary.", action: "search" },
    { id: "04", narration: "Click any session to view its full details, including the working directory and git refs.", action: "detail" },
    { id: "05", narration: "Conversations render with full markdown. Code blocks are syntax highlighted.", action: "conversation" },
    { id: "06", narration: "The files tab shows every file touched. Click to view with syntax highlighting, or download directly.", action: "files" },
    { id: "07", narration: "Collapse the sidebar with Control B to maximize your workspace.", action: "sidebar" },
    { id: "08", narration: "Switch between light and dark themes. Your preference is saved automatically.", action: "theme" },
    { id: "09", narration: "Open a persistent remote terminal. It survives browser disconnects, so you can reconnect from any device.", action: "terminal" },
    { id: "10", narration: "Launch multiple terminal tabs. Each gets a unique color. Run Copilot and shell sessions side by side.", action: "multitab" },
    { id: "11", narration: "Maximize the terminal for full screen focus. The Copilot Session Portal. Access your agent from anywhere.", action: "maximize" },
];

async function generateAudio() {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    console.log("🎙️  Generating narration audio...\n");

    for (const scene of SCENES) {
        const audioPath = path.join(AUDIO_DIR, `${scene.id}.mp3`);
        if (fs.existsSync(audioPath)) { console.log(`  ✓ ${scene.id} (cached)`); continue; }

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const tts = new EdgeTTS();
                await tts.synthesize(scene.narration, VOICE);
                const buffer = tts.toBuffer();
                fs.writeFileSync(audioPath, buffer);
                console.log(`  ✓ ${scene.id} generated`);
                break;
            } catch (err) {
                if (attempt < 2) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); }
                else { console.log(`  ✗ ${scene.id} failed: ${err.message}`); }
            }
        }
    }
    console.log("");
}

async function getAudioDuration(filePath) {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, { encoding: "utf-8" });
    return parseFloat(out.trim()) || 3;
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Step 1: Generate all narration audio
    await generateAudio();

    // Step 2: Record video
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordVideo: { dir: OUTPUT_DIR, size: { width: 1440, height: 900 } },
        colorScheme: "dark",
    });

    const page = await context.newPage();

    // Inject cursor + click ripple + caption
    await page.addInitScript(() => {
        window.addEventListener("DOMContentLoaded", () => {
            const cursor = document.createElement("div");
            cursor.id = "__cursor__";
            Object.assign(cursor.style, {
                position: "fixed", width: "20px", height: "20px", borderRadius: "50%",
                border: "2px solid rgba(88,166,255,0.8)", background: "rgba(88,166,255,0.2)",
                zIndex: "2147483647", pointerEvents: "none",
                transform: "translate(-50%, -50%)", transition: "top 0.08s ease, left 0.08s ease, width 0.1s, height 0.1s",
                top: "-50px", left: "-50px",
            });
            document.body.appendChild(cursor);

            window.addEventListener("mousemove", e => { cursor.style.left = e.clientX + "px"; cursor.style.top = e.clientY + "px"; });
            window.addEventListener("mousedown", e => {
                cursor.style.width = "28px"; cursor.style.height = "28px";
                cursor.style.background = "rgba(88,166,255,0.5)"; cursor.style.border = "2px solid rgba(88,166,255,1)";
                const ripple = document.createElement("div");
                Object.assign(ripple.style, { position: "fixed", left: (e.clientX-20)+"px", top: (e.clientY-20)+"px", width: "40px", height: "40px", borderRadius: "50%", border: "2px solid rgba(88,166,255,0.6)", background: "transparent", zIndex: "2147483646", pointerEvents: "none", animation: "clickRipple 0.4s ease-out forwards" });
                document.body.appendChild(ripple); setTimeout(() => ripple.remove(), 500);
            });
            window.addEventListener("mouseup", () => { cursor.style.width = "20px"; cursor.style.height = "20px"; cursor.style.background = "rgba(88,166,255,0.2)"; cursor.style.border = "2px solid rgba(88,166,255,0.8)"; });

            const style = document.createElement("style");
            style.textContent = `
                @keyframes clickRipple { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
                @keyframes captionIn { 0% { transform: translateY(20px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
                @keyframes captionOut { 0% { opacity: 1; } 100% { opacity: 0; } }
                #__caption__ { position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: #fff; padding: 12px 28px; border-radius: 12px; font-size: 16px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; z-index: 2147483646; pointer-events: none; white-space: nowrap; backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 20px rgba(0,0,0,0.4); display: none; }
            `;
            document.head.appendChild(style);
            const caption = document.createElement("div"); caption.id = "__caption__"; document.body.appendChild(caption);
        });
    });

    async function smoothClick(selector, pauseMs = 300) {
        const el = await page.$(selector); if (!el) return;
        const box = await el.boundingBox(); if (!box) return;
        await page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 15 });
        await sleep(pauseMs);
        await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
    }

    async function showCaption(text, durationMs = 2000) {
        await page.evaluate(({ text, dur }) => {
            const el = document.getElementById("__caption__");
            el.textContent = text; el.style.display = "block"; el.style.animation = "captionIn 0.3s ease forwards";
            setTimeout(() => { el.style.animation = "captionOut 0.3s ease forwards"; }, dur - 300);
            setTimeout(() => { el.style.display = "none"; }, dur);
        }, { text, dur: durationMs });
        await sleep(400);
    }

    console.log("📸 Recording video...\n");

    // Execute each scene, pacing to match audio duration
    for (const scene of SCENES) {
        const audioDur = await getAudioDuration(path.join(AUDIO_DIR, `${scene.id}.mp3`));
        const waitMs = Math.max(audioDur * 1000, 2000);
        console.log(`  ${scene.id} ${scene.action} (${audioDur.toFixed(1)}s)`);

        switch (scene.action) {
            case "dashboard":
                await page.goto(BASE_URL);
                await page.waitForSelector(".session-item", { timeout: 10000 });
                await showCaption("📊 Session Dashboard", waitMs);
                await sleep(waitMs - 400);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-dashboard.png`) });
                break;
            case "stats":
                await showCaption("📈 Stats Panel", waitMs);
                await smoothClick("#statsToggle"); await sleep(waitMs / 2);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-stats.png`) });
                await smoothClick("#statsToggle"); await sleep(500);
                break;
            case "search":
                await showCaption("🔍 Search Sessions", waitMs);
                await smoothClick("#globalSearch", 200);
                await page.fill("#globalSearch", "SecurityMarketplace"); await sleep(waitMs - 800);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-search.png`) });
                await page.fill("#globalSearch", ""); await sleep(300);
                break;
            case "detail":
                await showCaption("📋 Session Detail", waitMs);
                await smoothClick(".session-item");
                await page.waitForSelector(".detail-header", { timeout: 5000 }); await sleep(waitMs - 800);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-detail.png`) });
                break;
            case "conversation":
                await showCaption("💬 Markdown Conversation", waitMs);
                await smoothClick('.tab[data-tab="conversation"]'); await sleep(waitMs - 400);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-conversation.png`) });
                break;
            case "files":
                await showCaption("📁 Files — View & Download", waitMs);
                await smoothClick('.tab[data-tab="files"]'); await sleep(waitMs - 400);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-files.png`) });
                break;
            case "sidebar":
                await showCaption("☰ Collapsible Sidebar (Ctrl+B)", waitMs);
                await smoothClick("#sidebarToggle"); await sleep(waitMs - 800);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-sidebar.png`) });
                await smoothClick("#sidebarToggle"); await sleep(500);
                break;
            case "theme":
                await showCaption("🌙 Light / Dark Theme", waitMs);
                await smoothClick("#themeToggle"); await sleep(waitMs - 800);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-theme.png`) });
                await smoothClick("#themeToggle"); await sleep(500);
                break;
            case "terminal":
                await showCaption("⌨ Persistent Remote Terminal", waitMs);
                await smoothClick("#terminalBtn"); await sleep(waitMs - 400);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-terminal.png`) });
                break;
            case "multitab":
                await showCaption("🤖 Multi-Tab Terminals", waitMs);
                await smoothClick("#termNewCopilot"); await sleep(waitMs - 400);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-multitab.png`) });
                break;
            case "maximize":
                await showCaption("▲ Full Screen Terminal", waitMs);
                await smoothClick("#termMinMax"); await sleep(waitMs - 400);
                await page.screenshot({ path: path.join(OUTPUT_DIR, `${scene.id}-maximize.png`) });
                break;
        }
    }

    await sleep(1000);
    await context.close();
    await browser.close();

    // Rename raw video
    const videos = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".webm"));
    const rawVideo = path.join(OUTPUT_DIR, "raw-video.webm");
    if (videos.length > 0) {
        const src = path.join(OUTPUT_DIR, videos[videos.length - 1]);
        if (fs.existsSync(rawVideo)) fs.unlinkSync(rawVideo);
        fs.renameSync(src, rawVideo);
    }

    // Step 3: Merge audio with video using ffmpeg
    console.log("\n🎬 Merging audio + video with ffmpeg...\n");

    // Concatenate all audio files
    const audioList = path.join(AUDIO_DIR, "concat.txt");
    const concatContent = SCENES.map(s => `file '${s.id}.mp3'`).join("\n");
    fs.writeFileSync(audioList, concatContent);

    const mergedAudio = path.join(AUDIO_DIR, "narration.mp3");
    execSync(`ffmpeg -y -f concat -safe 0 -i "${audioList}" -c copy "${mergedAudio}"`, { stdio: "pipe" });

    // Merge video + audio
    const finalVideo = path.join(OUTPUT_DIR, "demo.webm");
    execSync(`ffmpeg -y -i "${rawVideo}" -i "${mergedAudio}" -c:v copy -c:a libopus -shortest "${finalVideo}"`, { stdio: "pipe" });

    // Cleanup
    try { fs.unlinkSync(rawVideo); } catch {}

    const pngs = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".png"));
    console.log(`✅ Video: docs/demo/demo.webm (with narration!)`);
    console.log(`✅ Screenshots: ${pngs.length} files`);
    console.log("\nDone! 🎉\n");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error("Failed:", err.message); process.exit(1); });
