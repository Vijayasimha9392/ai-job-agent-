// =====================================================================
// Job Hunter AI - Near Real-Time Multi-Channel Orchestration Engine
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
  fetchFastTierSources, 
  fetchNormalTierSources, 
  fetchAllSources 
} = require("./sources/sourceAggregator");

const { normalizeJob } = require("./pipeline/normalizer");
const { evaluateJobFreshness } = require("./pipeline/freshnessEngine");
const { generateJobFingerprint } = require("./pipeline/fingerprintEngine");
const { applyPreAiFilter } = require("./pipeline/preAiFilter");
const { classifyJobWithGemini } = require("./pipeline/geminiClassifier");
const { determineDispatchPriority, calculateOpportunityScore } = require("./pipeline/scoringEngine");
const { dispatchNotificationBatch } = require("./notifications/notification.service");
const { startServer } = require("./server");

// In-Memory Notification Queue for 2-Minute Aggregation Window
let notificationQueue = [];
let isFastTierRunning = false;
let isNormalTierRunning = false;
let isFlushingQueue = false;

/**
 * Processes an array of raw listings through the Near-Real-Time Funnel
 * @param {Array<object>} rawListings
 * @param {string} tierName
 */
async function processIncomingListings(rawListings = [], tierName = "FAST") {
  const startTime = Date.now();
  const runId = "run_" + Date.now() + "_" + crypto.randomBytes(3).toString("hex");

  let freshCount = 0;
  let prePassCount = 0;
  let evaluatedCount = 0;
  let qualifiedCount = 0;
  const errors = [];

  console.log(`\n=====================================================================`);
  console.log(`🚀 [Pipeline] Processing ${rawListings.length} raw jobs from ${tierName} Tier (${runId})`);
  console.log(`=====================================================================`);

  for (const raw of rawListings) {
    try {
      // 1. Normalization
      const normalized = normalizeJob(raw, raw.source || "Job Feed");

      // 2. Programmatic Freshness Filter (< 40 Hours & Non-Expired)
      const freshness = evaluateJobFreshness(normalized);
      if (!freshness.isFresh) {
        continue;
      }
      const freshJob = freshness.job;
      freshCount++;

      // 3. SHA-256 Fingerprint & Persistent Notified Duplicate Check
      const fingerprint = generateJobFingerprint(freshJob);
      const alreadyNotified = await hasJobBeenNotified(fingerprint);
      if (alreadyNotified) {
        // Exclude previously alerted jobs
        continue;
      }

      // 4. Pre-AI Hard Filter (Seniority, non-dev, 3+ yrs experience)
      const preFilter = applyPreAiFilter(freshJob);
      if (!preFilter.isPass) {
        await saveJobAndFingerprint(freshJob, fingerprint, "REJECTED_RULE_FILTER");
        continue;
      }
      prePassCount++;

      // 5. Save in database as EVALUATING
      await saveJobAndFingerprint(freshJob, fingerprint, "EVALUATING");

      // 6. Gemini AI Intelligence Evaluation
      const ageDisplay = freshJob.jobAgeMinutes !== null 
        ? (freshJob.jobAgeMinutes < 60 ? `${Math.round(freshJob.jobAgeMinutes)}m` : `${Math.round(freshJob.jobAgeHours)}h`)
        : "unverified";

      console.log(`🤖 [Gemini] Evaluating: "${freshJob.title}" at "${freshJob.company}" (Age: ${ageDisplay})...`);
      const evaluation = await classifyJobWithGemini(freshJob);
      evaluatedCount++;
      await saveJobEvaluation(freshJob.jobId, evaluation);

      // 7. Opportunity Scoring & Notification Decision
      const oppScoreMeta = calculateOpportunityScore(evaluation.matchScore, freshJob.freshnessScore, freshJob.source);
      const dispatchMeta = determineDispatchPriority(freshJob, evaluation, config.minMatchScore);

      console.log(`📈 [Score] Match: ${evaluation.matchScore}/100 | OppScore: ${oppScoreMeta.opportunityScore} | Priority: ${dispatchMeta.priorityLevel} | Notify: ${dispatchMeta.shouldNotify ? "YES" : "NO"}`);

      // 8. Add to Notification Queue if Qualified
      if (dispatchMeta.shouldNotify) {
        qualifiedCount++;
        // Check if already in current in-memory queue to avoid micro-burst duplicates
        const existsInQueue = notificationQueue.some(item => item.fingerprint === fingerprint);
        if (!existsInQueue) {
          notificationQueue.push({
            job: freshJob,
            fingerprint,
            evaluation,
            dispatchMeta
          });
          console.log(`📥 [Queue] Enqueued for 2-minute batch aggregation (Queue length: ${notificationQueue.length})`);
        }
      } else {
        await saveJobAndFingerprint(freshJob, fingerprint, "STORED_NOT_NOTIFIED");
      }
    } catch (itemErr) {
      errors.push({ error: itemErr.message });
      console.error(`⚠️ [Pipeline] Error processing job:`, itemErr.message);
    }
  }

  // Audit agent run
  await recordAgentRun({
    runId,
    tier: tierName,
    durationMs: Date.now() - startTime,
    sourcesPolled: [tierName],
    jobsDiscovered: rawListings.length,
    jobsFresh: freshCount,
    jobsPassedFilter: prePassCount,
    jobsEvaluated: evaluatedCount,
    jobsQualified: qualifiedCount,
    notificationsSent: 0,
    errors
  });

  console.log(`🏁 [Pipeline Complete] Ingested: ${rawListings.length} | Fresh (<40h): ${freshCount} | Pre-pass: ${prePassCount} | AI-Evaluated: ${evaluatedCount} | Qualified: ${qualifiedCount}`);
}

/**
 * Flushes the 2-Minute Aggregation Batch Queue
 */
async function flushNotificationBatch() {
  if (isFlushingQueue) return;
  if (notificationQueue.length === 0) return;

  isFlushingQueue = true;
  try {
    // Atomically drain queue
    const batchToDispatch = notificationQueue.splice(0);
    console.log(`\n🔔 [Batch Timer] Draining ${batchToDispatch.length} qualified jobs for multi-channel broadcast...`);

    const result = await dispatchNotificationBatch(batchToDispatch);
    const state = await getPipelineState();

    await updatePipelineState({
      last_successful_run: new Date().toISOString(),
      total_scans: (state.total_scans || 0) + 1,
      total_matches: (state.total_matches || 0) + batchToDispatch.length,
      total_notifications: (state.total_notifications || 0) + (result.overallStatus === "SENT" || result.overallStatus === "PARTIAL" ? 1 : 0)
    });
  } catch (err) {
    console.error("💥 [Batch Flusher] Error dispatching batch:", err.message);
  } finally {
    isFlushingQueue = false;
  }
}

/**
 * Executes Fast Tier Polling Cycle (2 minutes)
 */
async function runFastTierCycle() {
  if (isFastTierRunning) return;
  isFastTierRunning = true;
  try {
    const rawJobs = await fetchFastTierSources(candidateProfile.searchQueries);
    await processIncomingListings(rawJobs, "FAST");
  } catch (err) {
    console.error("💥 [Fast Tier] Error:", err.message);
  } finally {
    isFastTierRunning = false;
  }
}

/**
 * Executes Normal Tier Sources (5 minutes)
 */
async function runNormalTierCycle() {
  if (isNormalTierRunning) return;
  isNormalTierRunning = true;
  try {
    const rawJobs = await fetchNormalTierSources();
    await processIncomingListings(rawJobs, "NORMAL");
  } catch (err) {
    console.error("💥 [Normal Tier] Error:", err.message);
  } finally {
    isNormalTierRunning = false;
  }
}

/**
 * Main Entrypoint
 */
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║        🔥 JOB HUNTER AI — NEAR REAL-TIME AGENT (INDIA)               ║
║  Candidate: Vijayasimha Tammineni (Java Full Stack Developer)        ║
║  Fast Tier Polling:   Every ${config.polling.fastMinutes} Minutes (Greenhouse, Lever, Ashby, JSearch)║
║  Normal Tier Polling: Every ${config.polling.normalMinutes} Minutes (Workday, Public Feeds)     ║
║  Aggregation Window:  ${config.polling.aggregationWindowMinutes} Minutes (Consolidated Alert)           ║
║  Channels:            Email (Gmail) + Telegram Bot + Web Push (FCM) ║
║  Freshness Cutoff:    Strict < ${config.maxJobAgeHours}h (Programmatic Calculation)     ║
╚══════════════════════════════════════════════════════════════════════╝
  `);

  // 1. Initialize persistent storage
  await initDatabase();

  // 2. Start HTTP API & Web Dashboard
  startServer(config.port);

  // 3. Run initial discovery cycle across all sources
  console.log("\n⚡ [Bootstrap] Initiating initial full discovery scan across all tiers...");
  const initialJobs = await fetchAllSources(candidateProfile.searchQueries);
  await processIncomingListings(initialJobs, "BOOTSTRAP");

  // Immediate initial flush if any jobs matched
  await flushNotificationBatch();

  // 4. Start Near Real-Time Polling Schedulers
  const fastIntervalMs = config.polling.fastMinutes * 60 * 1000;
  const normalIntervalMs = config.polling.normalMinutes * 60 * 1000;
  const batchIntervalMs = config.polling.aggregationWindowMinutes * 60 * 1000;

  // Fast Tier: Every 2 minutes
  setInterval(async () => {
    await runFastTierCycle();
  }, fastIntervalMs);

  // Normal Tier: Every 5 minutes
  setInterval(async () => {
    await runNormalTierCycle();
  }, normalIntervalMs);

  // Aggregation Batch Flusher: Every 2 minutes
  setInterval(async () => {
    await flushNotificationBatch();
  }, batchIntervalMs);

  console.log(`\n⏰ [Scheduler Active]`);
  console.log(`   • Fast Tier Poller:        Every ${config.polling.fastMinutes} min (${fastIntervalMs / 1000}s)`);
  console.log(`   • Normal Tier Poller:      Every ${config.polling.normalMinutes} min (${normalIntervalMs / 1000}s)`);
  console.log(`   • Multi-Channel Flusher:   Every ${config.polling.aggregationWindowMinutes} min (${batchIntervalMs / 1000}s)`);
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
  processIncomingListings,
  flushNotificationBatch,
  runFastTierCycle,
  runNormalTierCycle
};
