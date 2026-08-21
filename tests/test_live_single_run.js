// =====================================================================
// Single Live Scan Cycle Runner
// =====================================================================

const { runScanCycle } = require("../src/index");
const { initDatabase } = require("../src/db/database");

async function runOnce() {
  console.log("⚡ Initiating single live scan cycle...");
  await initDatabase();
  await runScanCycle();
  console.log("✅ Single live scan cycle finished.");
  process.exit(0);
}

runOnce();
