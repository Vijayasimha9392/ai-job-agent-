// =====================================================================
// Job Hunter AI - 55-Minute Single Summary Orchestration Engine
// =====================================================================

const crypto = require("crypto");
const config = require("./config/env");
const candidateProfile = require("./config/candidateProfile");
const { 
  initDatabase, 
  isDuplicateFingerprint, 
  hasJobBeenNotified, 
  saveJobAndFingerprint, 
  saveJobEvaluation, 
  getPipelineState, 
  updatePipelineState,
  recordAgentRun
} = require("./db/database");

const { 
  fetchAllSources 
} = require("./sources/sourceAggregator");

const { normalizeJob } = require("./pipeline/normalizer");
const { evaluateJobFreshness } = require("./pipeline/freshnessEngine");
const { generateJobFingerprint } = require("./pipeline/fingerprintEngine");
const { applyPreAiFilter } = require("./pipeline/preAiFilter");
const { classifyJobWithGemini } = require("./pipeline/geminiClassifier");
const { determineDispatchPriority, calculateOpportunityScore } = require("./pipeline/scoringEngine");
const { renderSummaryEmail } = require("./notifications/emailRenderer");
const { dispatchNotificationBatch } = require("./notifications/notification.service");
const { startServer } = require("./server");

let isRunning = false;

/**
 * Runs a single complete 55-minute discovery scan cycle.
 * Evaluates all listings, excludes duplicates, collects all matches,
 * and sends EXACTLY ONE combined summary email and ONE Telegram alert.
 */
async function runScanCycle() {
  if (isRunning) {
    console.log("⏳ [Scanner] Previous scan cycle is still executing. Skipping duplicate trigger.");
    return { success: false, reason: "Already running" };
  }

  isRunning = true;
  const cycleStartTime = new Date();
  const runId = "cycle_" + Date.now() + "_" + crypto.randomBytes(3).toString("hex");

  console.log(`\n=====================================================================`);
  console.log(`🚀 [Job Hunter AI] Starting 55-Minute Scan Cycle (${runId})`);
  console.log(`   Time: ${cycleStartTime.toLocaleString("en-IN", { timeZone: config.timezone })}`);
  console.log(`=====================================================================`);

  let freshCount = 0;
  let prePassCount = 0;
  let evaluatedCount = 0;
  const qualifiedJobs = [];
  const errors = [];

  try {
    const state = await getPipelineState();
    console.log(`📊 [State] Prior stats: ${state.total_scans || 0} scans, ${state.total_matches || 0} matches, ${state.total_notifications || 0} alerts sent.`);

    // 1. Fetch raw jobs across all active verified sources
    const rawListings = await fetchAllSources(candidateProfile.searchQueries);
    console.log(`🌐 [Aggregator] Ingested ${rawListings.length} raw listings across all verified sources.`);

    // 2. Process each listing through the funnel
    for (const raw of rawListings) {
      try {
        // Step A: Normalize
        const normalized = normalizeJob(raw, raw.source || "Job Feed");

        // Step B: URL Validation (Must be genuine HTTP/HTTPS)
        if (!normalized.applicationUrl || !normalized.applicationUrl.startsWith("http")) {
          continue;
        }

        // Step C: Freshness Check (< 40 Hours & Non-Expired)
        const freshness = evaluateJobFreshness(normalized, cycleStartTime);
        if (!freshness.isFresh) {
          continue;
        }
        const freshJob = freshness.job;
        freshCount++;

        // Step D: SHA-256 Fingerprint & Persistent Notified Duplicate Check
        const fingerprint = generateJobFingerprint(freshJob);
        const alreadyNotified = await hasJobBeenNotified(fingerprint);
        if (alreadyNotified) {
          // Permanently skip previously notified jobs
          continue;
        }

        // Step E: Pre-AI Hard Filter (Seniority, non-dev, >=3 yrs experience)
        const preFilter = applyPreAiFilter(freshJob);
        if (!preFilter.isPass) {
          await saveJobAndFingerprint(freshJob, fingerprint, "REJECTED_RULE_FILTER");
          continue;
        }
        prePassCount++;

        // Step F: Save in database as EVALUATING
        await saveJobAndFingerprint(freshJob, fingerprint, "EVALUATING");

        // Step G: Gemini AI Intelligence Evaluation
        const ageDisplay = freshJob.jobAgeMinutes !== null 
          ? (freshJob.jobAgeMinutes < 60 ? `${Math.round(freshJob.jobAgeMinutes)}m` : `${Math.round(freshJob.jobAgeHours)}h`)
          : "unverified";

        console.log(`🤖 [Gemini] Evaluating: "${freshJob.title}" at "${freshJob.company}" (Age: ${ageDisplay})...`);
        const evaluation = await classifyJobWithGemini(freshJob);
        evaluatedCount++;
        await saveJobEvaluation(freshJob.jobId, evaluation);

        // Step H: Opportunity Scoring & Qualification Decision
        const oppScoreMeta = calculateOpportunityScore(evaluation.matchScore, freshJob.freshnessScore, freshJob.source);
        const dispatchMeta = determineDispatchPriority(freshJob, evaluation, config.minMatchScore);

        console.log(`📈 [Score] Match: ${evaluation.matchScore}/100 | OppScore: ${oppScoreMeta.opportunityScore} | Priority: ${dispatchMeta.priorityLevel} | Qualified: ${dispatchMeta.shouldNotify ? "YES" : "NO"}`);

        // Step I: Collect for single summary alert
        if (dispatchMeta.shouldNotify) {
          // Micro-burst deduplication within the same run
          const existsInBatch = qualifiedJobs.some(item => item.fingerprint === fingerprint);
          if (!existsInBatch) {
            qualifiedJobs.push({
              job: freshJob,
              fingerprint,
              evaluation,
              dispatchMeta
            });
          }
        } else {
          await saveJobAndFingerprint(freshJob, fingerprint, "STORED_NOT_NOTIFIED");
        }
      } catch (itemErr) {
        errors.push({ error: itemErr.message });
      }
    }

    // Step 3: DISPATCH EXACTLY ONE SINGLE SUMMARY EMAIL + TELEGRAM ALERT
    console.log(`\n📬 [Consolidated Dispatcher] Preparing ONE single summary alert (${qualifiedJobs.length} Qualified Jobs)...`);

    if (qualifiedJobs.length > 0) {
      // Dispatches the single combined batch across Email, Telegram, and Push
      const dispatchResult = await dispatchNotificationBatch(qualifiedJobs);
      console.log(`🚀 [Dispatch Result] Batch ID: ${dispatchResult.batchId} | Status: ${dispatchResult.overallStatus}`);
    } else {
      console.log(`ℹ️ [No New Jobs] 0 new matching jobs in this cycle. Next scan in ${config.scheduleIntervalMinutes || 55} minutes.`);
    }

    // Update state
    await updatePipelineState({
      last_successful_run: cycleStartTime.toISOString(),
      total_scans: (state.total_scans || 0) + 1,
      total_matches: (state.total_matches || 0) + qualifiedJobs.length,
      total_notifications: (state.total_notifications || 0) + (qualifiedJobs.length > 0 ? 1 : 0)
    });

    // Audit agent run
    await recordAgentRun({
      runId,
      tier: "55MIN_CYCLE",
      durationMs: Date.now() - cycleStartTime.getTime(),
      sourcesPolled: ["Greenhouse", "Lever", "Ashby", "SmartRecruiters", "Adzuna", "Arbeitnow", "Remotive"],
      jobsDiscovered: rawListings.length,
      jobsFresh: freshCount,
      jobsPassedFilter: prePassCount,
      jobsEvaluated: evaluatedCount,
      jobsQualified: qualifiedJobs.length,
      notificationsSent: qualifiedJobs.length > 0 ? 1 : 0,
      errors
    });

    console.log(`\n🎉 [55-Minute Cycle Complete] Ingested: ${rawListings.length} | Fresh (<40h): ${freshCount} | Pre-pass: ${prePassCount} | AI-Evaluated: ${evaluatedCount} | Matching (≥${config.minMatchScore}%): ${qualifiedJobs.length}`);
    return { success: true, count: qualifiedJobs.length };
  } catch (err) {
    console.error(`💥 [Cycle Error] Critical error: ${err.message}`, err.stack);
    return { success: false, error: err.message };
  } finally {
    isRunning = false;
  }
}

/**
 * Main Daemon Entrypoint
 */
async function main() {
  const intervalMinutes = config.scheduleIntervalMinutes || 55;
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║        🔥 JOB HUNTER AI — 55-MINUTE SINGLE SUMMARY AGENT (INDIA)     ║
║  Candidate: Vijayasimha Tammineni (Java Full Stack Developer)        ║
║  Schedule:  Runs Automatically Every ${intervalMinutes} Minutes                    ║
║  Rule:      EXACTLY ONE Consolidated Email per ${intervalMinutes}-Minute Run       ║
║  Channels:  Email (Nodemailer) + Telegram Bot + Web Push (FCM)       ║
║  Links:     100% Genuine Direct Application URLs                     ║
╚══════════════════════════════════════════════════════════════════════╝
  `);

  // 1. Initialize persistent storage
  await initDatabase();

  // 2. Start HTTP API & Web Dashboard
  startServer(config.port);

  // 3. Run initial discovery cycle immediately
  console.log("\n⚡ [Bootstrap] Running initial 55-minute discovery cycle...");
  await runScanCycle();

  // 4. Schedule automated recurring 55-minute interval
  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(async () => {
    console.log(`\n⏰ [Scheduler] ${intervalMinutes}-minute timer triggered. Starting automated cycle...`);
    await runScanCycle();
  }, intervalMs);

  console.log(`⏰ [Scheduler Active] Next automated cycle in ${intervalMinutes} minutes (${intervalMs / 1000}s).`);
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

module.exports = {
  main,
  runScanCycle
};
