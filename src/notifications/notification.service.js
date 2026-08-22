// =====================================================================
// Multi-Channel Notification Orchestrator - Email, Telegram, Web Push
// =====================================================================

const crypto = require("crypto");
const config = require("../config/env");
const emailService = require("./email.service");
const telegramService = require("./telegram.service");
const pushService = require("./push.service");
const { verifyCandidateBatch } = require("../pipeline/urlVerifier");
const { recordBatchNotification, markBatchJobsAsEmailed } = require("../db/database");

/**
 * Dispatches a shared batch of newly qualified jobs across all active channels.
 * Strictly verifies that every job has an active, verified HTTP 200 destination URL.
 * @param {Array<{job: object, fingerprint: string, evaluation: object, dispatchMeta: object}>} batch
 * @returns {Promise<{ batchId: string, overallStatus: string, channelResults: object }>}
 */
async function dispatchNotificationBatch(batch = [], options = { isTest: false }) {
  if (!batch || batch.length === 0) {
    return { batchId: null, overallStatus: "NO_JOBS", channelResults: {} };
  }

  // 1. Production Test Data Block
  const nonTestData = batch.filter(item => {
    const rawId = String(item.job?.jobId || item.job?.jobReferenceId || "").toLowerCase();
    if (
      rawId.startsWith("test_") ||
      rawId.startsWith("mock_") ||
      rawId.startsWith("demo_") ||
      rawId.startsWith("fixture_")
    ) {
      if (process.env.ALLOW_TEST_JOBS !== "true" && !options.isTest) {
        console.warn(`🛑 [TEST_DATA_BLOCKED] Omitted test job from production dispatch: "${rawId}"`);
        return false;
      }
    }
    return true;
  });

  if (nonTestData.length === 0) {
    return { batchId: null, overallStatus: "NO_REAL_JOBS", channelResults: {} };
  }

  // 2. Perform Live HTTP Application URL Verification
  let verifiedBatch = nonTestData;
  if (!options.isTest) {
    console.log(`🔍 [URL Verifier] Performing live HTTP checks on ${nonTestData.length} candidate job URLs...`);
    verifiedBatch = await verifyCandidateBatch(nonTestData);
  }

  // 3. Strict Pre-Dispatch Guard
  const finalBatch = verifiedBatch.filter(item => {
    const job = item.job;
    return (
      job &&
      job.company &&
      job.company !== "Confidential" &&
      job.title &&
      job.applicationUrl &&
      (options.isTest || (job.sourceVerified === true && job.applicationUrlVerified === true))
    );
  });

  if (finalBatch.length === 0) {
    console.log("ℹ️ [Dispatch Blocked] 0 candidate jobs passed live URL & source verification.");
    return { batchId: null, overallStatus: "NO_VERIFIED_JOBS", channelResults: {} };
  }

  const batchId = "batch_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");
  const count = finalBatch.length;
  console.log(`\n=====================================================================`);
  console.log(`📢 [Notification Orchestrator] Dispatching Batch ${batchId} (${count} Verified Jobs) ${options.isTest ? "[TEST MODE]" : ""}`);
  console.log(`=====================================================================`);

  if (options.isTest) {
    return {
      batchId,
      overallStatus: "SENT",
      simulated: true,
      channelResults: {
        email: { status: "SENT", simulated: true },
        telegram: { status: "SENT", simulated: true },
        push: { status: "SENT", simulated: true }
      }
    };
  }

  // Parallel Multi-Channel Dispatch (Promise.allSettled guarantees channel isolation)
  const [emailResult, telegramResult, pushResult] = await Promise.allSettled([
    config.notifications.enableEmail 
      ? emailService.sendBatch(finalBatch) 
      : Promise.resolve({ skipped: true, channel: "email" }),

    config.notifications.enableTelegram 
      ? telegramService.sendBatch(finalBatch) 
      : Promise.resolve({ skipped: true, channel: "telegram" }),

    config.notifications.enablePush 
      ? pushService.sendBatch(finalBatch) 
      : Promise.resolve({ skipped: true, channel: "push" })
  ]);

  // Evaluate Channel Statuses
  const emailStatus = emailResult.status === "fulfilled" 
    ? (emailResult.value.skipped ? "SKIPPED" : (emailResult.value.success ? "SENT" : "FAILED"))
    : "FAILED";
  const emailError = emailResult.status === "rejected" ? emailResult.reason?.message : (emailResult.value?.error || null);

  const telegramStatus = telegramResult.status === "fulfilled"
    ? (telegramResult.value.skipped ? "SKIPPED" : (telegramResult.value.success ? "SENT" : "FAILED"))
    : "FAILED";
  const telegramError = telegramResult.status === "rejected" ? telegramResult.reason?.message : (telegramResult.value?.error || null);

  const pushStatus = pushResult.status === "fulfilled"
    ? (pushResult.value.skipped ? "SKIPPED" : (pushResult.value.success ? "SENT" : "FAILED"))
    : "FAILED";
  const pushError = pushResult.status === "rejected" ? pushResult.reason?.message : (pushResult.value?.error || null);

  // Overall Status
  let overallStatus = "FAILED";
  const statuses = [emailStatus, telegramStatus, pushStatus].filter(s => s !== "SKIPPED");
  const allSent = statuses.length > 0 && statuses.every(s => s === "SENT");
  const anySent = statuses.some(s => s === "SENT");

  if (allSent) {
    overallStatus = "SENT";
  } else if (anySent) {
    overallStatus = "PARTIAL";
  }

  console.log(`📊 [Orchestrator Delivery Summary]`);
  console.log(`   • Email:    ${emailStatus} ${emailError ? "(" + emailError + ")" : ""}`);
  console.log(`   • Telegram: ${telegramStatus} ${telegramError ? "(" + telegramError + ")" : ""}`);
  console.log(`   • Push:     ${pushStatus} ${pushError ? "(" + pushError + ")" : ""}`);
  console.log(`   • Overall:  ${overallStatus}`);

  // Persist delivery audit records
  await recordBatchNotification({
    batchId,
    batch: finalBatch,
    emailStatus,
    emailError,
    telegramStatus,
    telegramError,
    pushStatus,
    pushError,
    overallStatus
  });

  // If at least one channel succeeded, mark jobs as notified in DB
  if (anySent) {
    const recipient = config.smtp.receiverEmail || config.candidateEmail || "user";
    await markBatchJobsAsEmailed(finalBatch, recipient, `Batch ${batchId}`);
  }

  return {
    batchId,
    overallStatus,
    count,
    channelResults: {
      email: { status: emailStatus, error: emailError },
      telegram: { status: telegramStatus, error: telegramError },
      push: { status: pushStatus, error: pushError }
    }
  };
}

module.exports = {
  dispatchNotificationBatch
};
