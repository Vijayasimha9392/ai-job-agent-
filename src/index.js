// =====================================================================
// Job Hunter AI - Scheduled Consolidated Job Discovery Agent
// =====================================================================

const crypto = require("crypto");

const config = require("./config/env");
const candidateProfile = require("./config/candidateProfile");

const {
  initDatabase,
  hasJobBeenNotified,
  saveJobAndFingerprint,
  saveJobEvaluation,
  getPipelineState,
  updatePipelineState,
  recordAgentRun
} = require("./db/database");

const { fetchAllSources } = require("./sources/sourceAggregator");

const { normalizeJob } = require("./pipeline/normalizer");
const { evaluateJobFreshness } = require("./pipeline/freshnessEngine");
const { generateJobFingerprint } = require("./pipeline/fingerprintEngine");
const { applyPreAiFilter } = require("./pipeline/preAiFilter");
const { classifyJobWithGemini } = require("./pipeline/geminiClassifier");

const {
  determineDispatchPriority,
  calculateOpportunityScore,
  sortJobsByFreshnessFirst
} = require("./pipeline/scoringEngine");

const { dispatchNotificationBatch } = require("./notifications/notification.service");
const { startServer } = require("./server");

let isRunning = false;
let schedulerStarted = false;

const MAX_JOB_DESCRIPTION_LENGTH = 12000;

function getJobAgeDisplay(job) {
  if (job.jobAgeMinutes === null || job.jobAgeMinutes === undefined) {
    return "unknown";
  }

  if (job.jobAgeMinutes < 60) {
    return `${Math.round(job.jobAgeMinutes)}m`;
  }

  return `${Math.round(job.jobAgeHours)}h`;
}

function isValidApplicationUrl(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function isSuccessfulNotification(dispatchResult) {
  if (!dispatchResult) {
    return false;
  }

  const channelResults = dispatchResult.channelResults || {};

  const successfulChannel = Object.values(channelResults).some(
    (channel) => channel?.status === "SENT"
  );

  return (
    successfulChannel ||
    dispatchResult.overallStatus === "SENT" ||
    dispatchResult.overallStatus === "PARTIAL"
  );
}

function isGeminiEvaluationApproved(evaluation) {
  return Boolean(
    evaluation &&
    evaluation.evaluationStatus === "GEMINI_EVALUATED" &&
    evaluation.isFallback !== true &&
    evaluation.isEligible === true &&
    evaluation.candidateExperienceSuitable === true &&
    Number.isFinite(Number(evaluation.matchScore))
  );
}

/**
 * Runs one complete job discovery and evaluation cycle.
 *
 * Jobs are:
 * 1. Retrieved from configured sources
 * 2. Normalized
 * 3. Validated for URL and freshness
 * 4. Checked for previously notified duplicates
 * 5. Passed through deterministic filtering
 * 6. Evaluated by Gemini
 * 7. Scored and qualified
 * 8. Dispatched in one consolidated batch
 */
async function runScanCycle() {
  if (isRunning) {
    console.log(
      "⏳ [Scanner] Previous scan is still running. Skipping this trigger."
    );

    return {
      success: false,
      reason: "Already running"
    };
  }

  isRunning = true;

  const cycleStartTime = new Date();

  const runId =
    `cycle_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  let rawListings = [];
  let freshCount = 0;
  let prePassCount = 0;
  let evaluatedCount = 0;
  let notificationSent = false;

  const qualifiedJobs = [];
  const errors = [];

  console.log("\n==============================================================");
  console.log(`🚀 [Job Hunter AI] Starting scan cycle: ${runId}`);
  console.log(
    `🕒 Time: ${cycleStartTime.toLocaleString("en-IN", {
      timeZone: config.timezone
    })}`
  );
  console.log(
    `📅 Maximum job age: ${config.maxJobAgeHours} hours`
  );
  console.log("==============================================================");

  try {
    const state = await getPipelineState();

    console.log(
      `📊 Previous scans: ${state.total_scans || 0} | ` +
      `Matches: ${state.total_matches || 0} | ` +
      `Notifications: ${state.total_notifications || 0}`
    );

    // ---------------------------------------------------------------
    // STEP 1: Fetch job listings
    // ---------------------------------------------------------------

    rawListings = await fetchAllSources(
      candidateProfile.searchQueries
    );

    if (!Array.isArray(rawListings)) {
      rawListings = [];
    }

    console.log(
      `🌐 [Aggregator] Retrieved ${rawListings.length} job listings.`
    );

    // ---------------------------------------------------------------
    // STEP 2: Process each job
    // ---------------------------------------------------------------

    for (const rawJob of rawListings) {
      let normalizedJob = null;
      let fingerprint = null;

      try {
        // Step A: Normalize
        normalizedJob = normalizeJob(
          rawJob,
          rawJob?.source || "Job Feed"
        );

        if (!normalizedJob || !normalizedJob.jobId) {
          errors.push({
            stage: "NORMALIZATION",
            error: "Job normalization failed or job ID missing."
          });

          continue;
        }

        // Limit oversized job descriptions before AI evaluation.
        if (
          typeof normalizedJob.description === "string" &&
          normalizedJob.description.length > MAX_JOB_DESCRIPTION_LENGTH
        ) {
          normalizedJob.description =
            normalizedJob.description.substring(
              0,
              MAX_JOB_DESCRIPTION_LENGTH
            );
        }

        // Step B: Validate application URL
        if (!isValidApplicationUrl(normalizedJob.applicationUrl)) {
          continue;
        }

        // Step C: Check freshness
        const freshness = evaluateJobFreshness(
          normalizedJob,
          cycleStartTime
        );

        if (!freshness || !freshness.isFresh || !freshness.job) {
          continue;
        }

        const freshJob = freshness.job;

        // Use configured freshness limit instead of a hardcoded value.
        if (
          freshJob.jobAgeHours !== null &&
          freshJob.jobAgeHours !== undefined &&
          Number(freshJob.jobAgeHours) > config.maxJobAgeHours
        ) {
          continue;
        }

        freshCount++;

        // Step D: Generate persistent fingerprint
        fingerprint = generateJobFingerprint(freshJob);

        if (!fingerprint) {
          errors.push({
            stage: "FINGERPRINT",
            jobId: freshJob.jobId,
            error: "Fingerprint generation failed."
          });

          continue;
        }

        // Step E: Skip previously notified jobs
        const alreadyNotified = await hasJobBeenNotified(
          fingerprint
        );

        if (alreadyNotified) {
          console.log(
            `♻️ [Duplicate] Previously notified: ${freshJob.title}`
          );

          continue;
        }

        // Step F: Apply deterministic pre-AI filters
        const preFilter = applyPreAiFilter(freshJob);

        if (!preFilter || !preFilter.isPass) {
          await saveJobAndFingerprint(
            freshJob,
            fingerprint,
            "REJECTED_RULE_FILTER"
          );

          continue;
        }

        prePassCount++;

        // Step G: Save job before Gemini evaluation
        await saveJobAndFingerprint(
          freshJob,
          fingerprint,
          "EVALUATING"
        );

        console.log(
          `🤖 [Gemini] Evaluating "${freshJob.title}" ` +
          `at "${freshJob.company}" ` +
          `(Age: ${getJobAgeDisplay(freshJob)})`
        );

        // Step H: Evaluate using Gemini
        const evaluation = await classifyJobWithGemini(
          freshJob
        );

        evaluatedCount++;

        await saveJobEvaluation(
          freshJob.jobId,
          evaluation
        );

        // Step I: Fail closed if Gemini did not successfully evaluate
        if (!isGeminiEvaluationApproved(evaluation)) {
          const status =
            evaluation?.evaluationStatus || "GEMINI_FAILED";

          await saveJobAndFingerprint(
            freshJob,
            fingerprint,
            status
          );

          console.log(
            `🛑 [Blocked] Job cannot be automatically notified. ` +
            `Evaluation status: ${status}`
          );

          continue;
        }

        // Step J: Calculate opportunity score
        const opportunityScore = calculateOpportunityScore(
          evaluation.matchScore,
          freshJob.freshnessScore,
          freshJob.source
        );

        const dispatchMeta = determineDispatchPriority(
          freshJob,
          evaluation,
          config.minMatchScore
        );

        console.log(
          `📈 [Score] Match: ${evaluation.matchScore}/100 | ` +
          `Opportunity: ${opportunityScore.opportunityScore} | ` +
          `Priority: ${dispatchMeta.priorityLevel} | ` +
          `Qualified: ${dispatchMeta.shouldNotify ? "YES" : "NO"}`
        );

        // Step K: Collect qualified jobs
        if (dispatchMeta.shouldNotify) {
          const existsInBatch = qualifiedJobs.some(
            (item) => item.fingerprint === fingerprint
          );

          if (!existsInBatch) {
            qualifiedJobs.push({
              job: freshJob,
              fingerprint,
              evaluation,
              dispatchMeta
            });
          }
        } else {
          await saveJobAndFingerprint(
            freshJob,
            fingerprint,
            "STORED_NOT_NOTIFIED"
          );
        }
      } catch (itemError) {
        console.error(
          `⚠️ [Job Processing Error] ${normalizedJob?.title || "Unknown job"}:`,
          itemError.message
        );

        errors.push({
          stage: "JOB_PROCESSING",
          jobId: normalizedJob?.jobId || null,
          error: itemError.message
        });
      }
    }

    // ---------------------------------------------------------------
    // STEP 3: Sort and dispatch consolidated notifications
    // ---------------------------------------------------------------

    const sortedJobs = sortJobsByFreshnessFirst(
      qualifiedJobs
    );

    console.log("\n📬 [Notification Dispatcher]");
    console.log(
      `Qualified jobs ready for notification: ${sortedJobs.length}`
    );

    if (sortedJobs.length > 0) {
      try {
        const dispatchResult =
          await dispatchNotificationBatch(sortedJobs);

        notificationSent =
          isSuccessfulNotification(dispatchResult);

        console.log(
          `📨 Batch ID: ${dispatchResult?.batchId || "N/A"}`
        );

        console.log(
          `📊 Delivery status: ${dispatchResult?.overallStatus || "UNKNOWN"}`
        );

        if (!notificationSent) {
          console.warn(
            "⚠️ No notification channel confirmed successful delivery."
          );
        }
      } catch (dispatchError) {
        console.error(
          "❌ [Dispatcher] Notification dispatch failed:",
          dispatchError.message
        );

        errors.push({
          stage: "NOTIFICATION_DISPATCH",
          error: dispatchError.message
        });

        notificationSent = false;
      }
    } else {
      console.log(
        `ℹ️ No qualified jobs found. Next scan in ` +
        `${config.scheduleIntervalMinutes} minutes.`
      );
    }

    // ---------------------------------------------------------------
    // STEP 4: Update pipeline statistics
    // ---------------------------------------------------------------

    const previousNotifications =
      state.total_notifications || 0;

    await updatePipelineState({
      last_successful_run: cycleStartTime.toISOString(),

      total_scans:
        (state.total_scans || 0) + 1,

      total_matches:
        (state.total_matches || 0) + qualifiedJobs.length,

      // Count notification only when at least one channel succeeded.
      total_notifications:
        previousNotifications + (notificationSent ? 1 : 0)
    });

    // ---------------------------------------------------------------
    // STEP 5: Record audit information
    // ---------------------------------------------------------------

    await recordAgentRun({
      runId,
      tier: "SCHEDULED_SCAN",

      durationMs:
        Date.now() - cycleStartTime.getTime(),

      sourcesPolled: [
        "Greenhouse",
        "Lever",
        "Ashby",
        "SmartRecruiters",
        "Adzuna",
        "Arbeitnow",
        "Remotive"
      ],

      jobsDiscovered: rawListings.length,
      jobsFresh: freshCount,
      jobsPassedFilter: prePassCount,
      jobsEvaluated: evaluatedCount,
      jobsQualified: qualifiedJobs.length,

      notificationsSent:
        notificationSent ? 1 : 0,

      errors
    });

    console.log("\n==============================================================");
    console.log("✅ [Scan Cycle Completed]");
    console.log(`Discovered: ${rawListings.length}`);
    console.log(`Fresh: ${freshCount}`);
    console.log(`Passed pre-AI filter: ${prePassCount}`);
    console.log(`Gemini evaluated: ${evaluatedCount}`);
    console.log(`Qualified: ${qualifiedJobs.length}`);
    console.log(
      `Notification sent: ${notificationSent ? "YES" : "NO"}`
    );
    console.log(`Errors: ${errors.length}`);
    console.log("==============================================================");

    return {
      success: true,
      runId,
      discovered: rawListings.length,
      fresh: freshCount,
      preFiltered: prePassCount,
      evaluated: evaluatedCount,
      qualified: qualifiedJobs.length,
      notificationSent,
      errors
    };
  } catch (error) {
    console.error(
      "💥 [Critical Scan Error]",
      error.message,
      error.stack
    );

    errors.push({
      stage: "SCAN_CYCLE",
      error: error.message
    });

    return {
      success: false,
      runId,
      error: error.message,
      errors
    };
  } finally {
    isRunning = false;
  }
}

// =====================================================================
// Main Application Entrypoint
// =====================================================================

async function main() {
  if (schedulerStarted) {
    console.warn(
      "[Startup] Scheduler already started. Ignoring duplicate main() call."
    );

    return;
  }

  schedulerStarted = true;

  const intervalMinutes =
    Number(config.scheduleIntervalMinutes) || 55;

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                 JOB HUNTER AI — JOB DISCOVERY AGENT                 ║
╠══════════════════════════════════════════════════════════════════════╣
║ Candidate: Vijayasimha Tammineni                                     ║
║ Target: Java Backend / Java Full Stack / SDE-1                      ║
║ Scan interval: ${String(intervalMinutes).padEnd(4)} minutes                                           ║
║ Max job age: ${String(config.maxJobAgeHours).padEnd(4)} hours                                             ║
║ Timezone: ${config.timezone}                                            ║
║ AI: ${config.geminiModel}                                               ║
╚══════════════════════════════════════════════════════════════════════╝
  `);

  // Initialize database
  await initDatabase();

  // Start API/dashboard server
  startServer(config.port);

  // Run first scan immediately
  console.log(
    "\n⚡ [Startup] Starting initial job discovery scan..."
  );

  await runScanCycle();

  // Start recurring scans
  const intervalMs =
    intervalMinutes * 60 * 1000;

  setInterval(async () => {
    console.log(
      `\n⏰ [Scheduler] ${intervalMinutes}-minute interval triggered.`
    );

    await runScanCycle();
  }, intervalMs);

  console.log(
    `⏰ [Scheduler] Active. Next scan in ${intervalMinutes} minutes.`
  );
}

// =====================================================================
// Process-Level Error Handlers
// =====================================================================

process.on("unhandledRejection", (reason) => {
  console.error(
    "⚠️ [Process] Unhandled promise rejection:",
    reason
  );
});

process.on("uncaughtException", (error) => {
  console.error(
    "💥 [Process] Uncaught exception:",
    error
  );
});

// =====================================================================
// Entrypoint
// =====================================================================

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "💥 [Startup Failure]",
      error.message,
      error.stack
    );

    process.exitCode = 1;
  });
}

module.exports = {
  main,
  runScanCycle,
  isGeminiEvaluationApproved,
  isSuccessfulNotification
};
