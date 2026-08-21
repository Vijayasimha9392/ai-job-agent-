// =====================================================================
// AI Job Recommendation Agent - Main Execution Engine
// =====================================================================

const config = require("./config/env");
const candidateProfile = require("./config/candidateProfile");
const { initDatabase, isDuplicateFingerprint, hasJobBeenEmailed, saveJobAndFingerprint, saveJobEvaluation, getPipelineState, updatePipelineState } = require("./db/database");
const { aggregateJobsFromAllSources } = require("./sources/sourceAggregator");
const { normalizeJob } = require("./pipeline/normalizer");
const { evaluateJobFreshness } = require("./pipeline/freshnessEngine");
const { generateJobFingerprint } = require("./pipeline/fingerprintEngine");
const { applyPreAiFilter } = require("./pipeline/preAiFilter");
const { classifyJobWithGemini } = require("./pipeline/geminiClassifier");
const { determineDispatchPriority, calculateOpportunityScore } = require("./pipeline/scoringEngine");
const { renderSummaryEmail } = require("./notifications/emailRenderer");
const { sendSummaryAlertEmail } = require("./notifications/emailSender");

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
  const qualifiedJobs = [];

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

      // Step B: Freshness Filter (< 24 Hours & Non-expired)
      const freshness = evaluateJobFreshness(normalized, cycleStartTime);
      if (!freshness.isFresh) {
        continue;
      }
      const freshJob = freshness.job;
      freshJobsCount++;

      // Step C: Fingerprint Generation & Duplicate Emailed Exclusion
      const fingerprint = generateJobFingerprint(freshJob);
      const isAlreadyEmailed = await hasJobBeenEmailed(fingerprint);

      if (isAlreadyEmailed) {
        // Exclude previously emailed jobs completely
        continue;
      }

      // Step D: Pre-AI Rule-Based Filter (Zero-cost screening: 0-2 yrs, non-senior, tech title)
      const preFilter = applyPreAiFilter(freshJob);
      if (!preFilter.isPass) {
        await saveJobAndFingerprint(freshJob, fingerprint, "REJECTED_RULE_FILTER");
        continue;
      }
      preFilteredPassCount++;

      // Step E: Save to DB as EVALUATING
      await saveJobAndFingerprint(freshJob, fingerprint, "EVALUATING");

      // Step F: Gemini AI Evaluation
      console.log(`🤖 [Gemini] Evaluating: "${freshJob.title}" at "${freshJob.company}" (Age: ${freshJob.jobAgeHours}h)...`);
      const evaluation = await classifyJobWithGemini(freshJob);
      await saveJobEvaluation(freshJob.jobId, evaluation);

      // Step G: Composite Scoring & Dispatch Decision
      const oppScoreMeta = calculateOpportunityScore(evaluation.matchScore, freshJob.freshnessScore, freshJob.source);
      const dispatchMeta = determineDispatchPriority(freshJob, evaluation, config.minMatchScoreToEmail);

      console.log(`📈 [Result] Score: ${evaluation.matchScore}/100 | OppScore: ${oppScoreMeta.opportunityScore} | Priority: ${dispatchMeta.priorityLevel}`);

      // Step H: Collect for single summary email if eligible & score >= 80
      if (dispatchMeta.shouldEmail) {
        qualifiedJobs.push({
          job: freshJob,
          fingerprint,
          evaluation,
          dispatchMeta
        });
      } else {
        await saveJobAndFingerprint(freshJob, fingerprint, "STORED_NOT_EMAILED");
      }
    }

    // Step I: Send EXACTLY ONE summary email per completed run (Combining all or sending "No New Jobs")
    console.log(`\n📬 [Email Dispatcher] Preparing 55-minute cycle summary (Qualified Jobs: ${qualifiedJobs.length})...`);
    const emailPayload = renderSummaryEmail(qualifiedJobs, config.timezone, candidateProfile.name || config.candidateName);
    const sendResult = await sendSummaryAlertEmail(qualifiedJobs, emailPayload);

    // Update state
    await updatePipelineState({
      last_successful_run: cycleStartTime.toISOString(),
      total_scans: (state.total_scans || 0) + 1,
      total_matches: (state.total_matches || 0) + qualifiedJobs.length,
      total_emails: (state.total_emails || 0) + (sendResult.success ? 1 : 0)
    });

    console.log(`\n🎉 [Cycle Complete] Scanned: ${newJobsCount} | Fresh (<24h): ${freshJobsCount} | Pre-passed: ${preFilteredPassCount} | High Matches (≥80%): ${qualifiedJobs.length} | Summary Email Sent: ${sendResult.success ? "YES" : "NO"}`);
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
