// =====================================================================
// AI Job Recommendation Agent - Main Execution Engine
// =====================================================================

const config = require("./config/env");
const candidateProfile = require("./config/candidateProfile");
const { initDatabase, isDuplicateFingerprint, saveJobAndFingerprint, saveJobEvaluation, getPipelineState, updatePipelineState } = require("./db/database");
const { aggregateJobsFromAllSources } = require("./sources/sourceAggregator");
const { normalizeJob } = require("./pipeline/normalizer");
const { evaluateJobFreshness } = require("./pipeline/freshnessEngine");
const { generateJobFingerprint } = require("./pipeline/fingerprintEngine");
const { applyPreAiFilter } = require("./pipeline/preAiFilter");
const { classifyJobWithGemini } = require("./pipeline/geminiClassifier");
const { determineDispatchPriority, calculateOpportunityScore } = require("./pipeline/scoringEngine");
const { renderJobAlertEmail } = require("./notifications/emailRenderer");
const { sendJobAlertEmail } = require("./notifications/emailSender");

let cron = null;
try {
  cron = require("node-cron");
} catch (e) {}

let isRunning = false;

async function runScanCycle() {
  if (isRunning) {
    console.log("⏳ [Scanner] Previous scan cycle is still executing. Skipping this tick.");
    return;
  }

  isRunning = true;
  const cycleStartTime = new Date();
  console.log(`\n=====================================================================`);
  console.log(`🚀 [Scanner] Starting AI Job Scan Cycle at ${cycleStartTime.toLocaleString("en-IN", { timeZone: config.timezone })}`);
  console.log(`=====================================================================`);

  let newJobsCount = 0;
  let freshJobsCount = 0;
  let preFilteredPassCount = 0;
  let matchedAlertsCount = 0;

  try {
    const state = await getPipelineState();
    console.log(`📊 [State] Prior stats: ${state.total_scans || 0} scans, ${state.total_matches || 0} matches, ${state.total_emails || 0} emails.`);

    // 1. Fetch raw jobs across all sources
    const rawListings = await aggregateJobsFromAllSources(candidateProfile.searchQueries.slice(0, 5));
    newJobsCount = rawListings.length;

    // 2. Process each listing through the funnel
    for (const raw of rawListings) {
      // Step A: Normalize
      const normalized = normalizeJob(raw, raw.source || "Job Feed");

      // Step B: Freshness Filter (< 40 Hours)
      const freshness = evaluateJobFreshness(normalized, cycleStartTime);
      if (!freshness.isFresh) {
        continue;
      }
      const freshJob = freshness.job;
      freshJobsCount++;

      // Step C: Fingerprint Generation & Duplicate Check
      const fingerprint = generateJobFingerprint(freshJob);
      const isDuplicate = await isDuplicateFingerprint(fingerprint);

      if (isDuplicate) {
        continue;
      }

      // Step D: Pre-AI Rule-Based Filter (Zero-cost screening)
      const preFilter = applyPreAiFilter(freshJob);
      if (!preFilter.isPass) {
        await saveJobAndFingerprint(freshJob, fingerprint, "REJECTED_RULE_FILTER");
        continue;
      }
      preFilteredPassCount++;

      // Step E: Save to DB as NEW before AI call
      await saveJobAndFingerprint(freshJob, fingerprint, "EVALUATING");

      // Step F: Gemini AI Evaluation
      console.log(`🤖 [Gemini] Evaluating: "${freshJob.title}" at "${freshJob.company}" (Age: ${freshJob.jobAgeHours}h)...`);
      const evaluation = await classifyJobWithGemini(freshJob);
      await saveJobEvaluation(freshJob.jobId, evaluation);

      // Step G: Composite Scoring & Dispatch Decision
      const oppScoreMeta = calculateOpportunityScore(evaluation.matchScore, freshJob.freshnessScore, freshJob.source);
      const dispatchMeta = determineDispatchPriority(freshJob, evaluation, config.minMatchScoreToEmail);

      console.log(`📈 [Result] Score: ${evaluation.matchScore}/100 | OppScore: ${oppScoreMeta.opportunityScore} | Priority: ${dispatchMeta.priorityLevel}`);

      // Step H: Send Email if eligible & score passes threshold
      if (dispatchMeta.shouldEmail) {
        matchedAlertsCount++;
        const emailPayload = renderJobAlertEmail(freshJob, evaluation, dispatchMeta, config.timezone);
        await sendJobAlertEmail(freshJob, fingerprint, evaluation, dispatchMeta, emailPayload);
      } else {
        await saveJobAndFingerprint(freshJob, fingerprint, "STORED_NOT_EMAILED");
      }
    }

    // Update state
    await updatePipelineState({
      last_successful_run: cycleStartTime.toISOString(),
      total_scans: (state.total_scans || 0) + 1,
      total_matches: (state.total_matches || 0) + matchedAlertsCount,
      total_emails: (state.total_emails || 0) + matchedAlertsCount
    });

    console.log(`\n🎉 [Cycle Complete] Scanned: ${newJobsCount} | Fresh (<40h): ${freshJobsCount} | Pre-passed: ${preFilteredPassCount} | Alerts Sent: ${matchedAlertsCount}`);
  } catch (err) {
    console.error(`💥 [Scanner] Critical error in scan cycle: ${err.message}`, err.stack);
  } finally {
    isRunning = false;
  }
}

async function main() {
  const intervalMinutes = config.scheduleIntervalMinutes || 55;
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║        ANTIGRAVITY AI JOB RECOMMENDATION AGENT (INDIA)               ║
║  Profile: Java Full Stack Developer (0-2 yrs, 2025 B.Tech CSE)       ║
║  Schedule: Automatically Every ${intervalMinutes} Minutes                       ║
║  Target Freshness: < ${config.maxJobAgeHours}h (Strict Live Check & Freshness)     ║
╚══════════════════════════════════════════════════════════════════════╝
  `);

  await initDatabase();

  // Run immediately on boot
  console.log("⚡ [Bootstrap] Running initial job discovery scan...");
  await runScanCycle();

  // Schedule recurring execution every 55 minutes
  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(async () => {
    console.log(`\n⏰ [Scheduler] ${intervalMinutes}-minute interval triggered. Starting automated scan...`);
    await runScanCycle();
  }, intervalMs);

  console.log(`⏰ [Scheduler] Automated timer active: Running every ${intervalMinutes} minutes (${intervalMs / 1000}s).`);
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

if (require.main === module) {
  main();
}

module.exports = { runScanCycle, main };
