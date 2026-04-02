const { createApp } = require("./app");
const { PORT, SESSION_STORE_PATH, SESSION_STATE_DIR } = require("./lib/config");

const { server } = createApp();

server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  🚀 Copilot Session Portal                   ║`);
    console.log(`  ║  http://localhost:${PORT}                      ║`);
    console.log(`  ╚══════════════════════════════════════════════╝`);
    console.log(`  📊 Store: ${SESSION_STORE_PATH}`);
    console.log(`  📁 State: ${SESSION_STATE_DIR}\n`);
});
