// =====================================================================
// Single Live Scan Cycle Runner for GitHub Actions / CLI
// =====================================================================

const { runScanCycle } = require("../src/index");
const { initDatabase } = require("../src/db/database");

async function runOnce() {
  console.log("⚡ Initiating 55-minute single live scan cycle...");
  try {
    await initDatabase();
    const result = await runScanCycle();
    console.log(`✅ Single live scan cycle finished. Result:`, result);
    process.exit(0);
  } catch (err) {
    console.error(`💥 [Runner Error] Execution failed:`, err);
    process.exit(1);
  }
}

runOnce();

