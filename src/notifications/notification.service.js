// =====================================================================
// Multi-Channel Notification Orchestrator
// Email, Telegram, Web Push
// =====================================================================

const crypto = require("crypto");

const config = require("../config/env");

const emailService = require("./email.service");
const telegramService = require("./telegram.service");
const pushService = require("./push.service");

const { verifyCandidateBatch } = require("../pipeline/urlVerifier");

const {
  recordBatchNotification,
  markBatchJobsAsEmailed
} = require("../db/database");

// =====================================================================
// Constants
// =====================================================================

const CHANNELS = ["email", "telegram", "push"];

const STATUS = {
  SENT: "SENT",
  FAILED: "FAILED",
  SIMULATED: "SIMULATED",
  SKIPPED: "SKIPPED"
};

// =====================================================================
// Helpers
// =====================================================================

function getErrorMessage(error) {
  if (!error) {
    return null;
  }

  return error.message || String(error);
}

function isTestJob(job) {
  const rawId = String(
    job?.jobId ||
    job?.jobReferenceId ||
    ""
  ).toLowerCase();

  return (
    rawId.startsWith("test_") ||
    rawId.startsWith("mock_") ||
    rawId.startsWith("demo_") ||
    rawId.startsWith("fixture_")
  );
}

function isValidJobForDispatch(item, isTestMode) {
  const job = item?.job;

  if (!job) {
    return false;
  }

  if (!job.company || job.company === "Confidential") {
    return false;
  }

  if (!job.title || !job.applicationUrl) {
    return false;
  }

  if (isTestMode) {
    return true;
  }

  return (
    job.sourceVerified === true &&
    job.applicationUrlVerified === true
  );
}

/**
 * A simulated notification is NOT a real delivery.
 */
function getChannelStatus(result) {
  if (!result || result.status === "rejected") {
    return STATUS.FAILED;
  }

  const value = result.value;

  if (!value) {
    return STATUS.FAILED;
  }

  if (value.skipped === true) {
    return STATUS.SKIPPED;
  }

  if (value.simulated === true) {
    return STATUS.SIMULATED;
  }

  if (value.success === true) {
    return STATUS.SENT;
  }

  return STATUS.FAILED;
}

function getChannelError(result) {
  if (!result) {
    return "No channel result available.";
  }

  if (result.status === "rejected") {
    return getErrorMessage(result.reason);
  }

  return result.value?.error || null;
}

function isRealDelivery(status) {
  return status === STATUS.SENT;
}

// =====================================================================
// Main Notification Dispatcher
// =====================================================================

/**
 * Dispatches a batch of qualified jobs across enabled notification
 * channels.
 *
 * A channel is considered SENT only when its service confirms a
 * non-simulated successful delivery.
 *
 * @param {Array} batch
 * @param {{ isTest?: boolean }} options
 *
 * @returns {Promise<object>}
 */
async function dispatchNotificationBatch(
  batch = [],
  options = {}
) {
  const isTestMode = options.isTest === true;

  // -------------------------------------------------------------------
  // Step 1: Validate input
  // -------------------------------------------------------------------

  if (!Array.isArray(batch) || batch.length === 0) {
    return {
      batchId: null,
      overallStatus: "NO_JOBS",
      count: 0,
      simulated: false,
      hasRealDelivery: false,
      channelResults: {}
    };
  }

  // -------------------------------------------------------------------
  // Step 2: Block test/mock jobs in production
  // -------------------------------------------------------------------

  const nonTestBatch = batch.filter(item => {
    if (!isTestJob(item?.job)) {
      return true;
    }

    if (
      process.env.ALLOW_TEST_JOBS !== "true" &&
      !isTestMode
    ) {
      console.warn(
        `🛑 [TEST_DATA_BLOCKED] Excluded job: ${
          item?.job?.jobId || "Unknown"
        }`
      );

      return false;
    }

    return true;
  });

  if (nonTestBatch.length === 0) {
    return {
      batchId: null,
      overallStatus: "NO_REAL_JOBS",
      count: 0,
      simulated: false,
      hasRealDelivery: false,
      channelResults: {}
    };
  }

  // -------------------------------------------------------------------
  // Step 3: Verify application URLs
  // -------------------------------------------------------------------

  let verifiedBatch = nonTestBatch;

  if (!isTestMode) {
    console.log(
      `🔍 [URL Verifier] Checking ${nonTestBatch.length} job URLs...`
    );

    try {
      verifiedBatch = await verifyCandidateBatch(nonTestBatch);
    } catch (error) {
      console.error(
        "❌ [URL Verifier] Verification failed:",
        error.message
      );

      return {
        batchId: null,
        overallStatus: "VERIFICATION_FAILED",
        count: 0,
        simulated: false,
        hasRealDelivery: false,
        error: error.message,
        channelResults: {}
      };
    }
  }

  // -------------------------------------------------------------------
  // Step 4: Final dispatch validation
  // -------------------------------------------------------------------

  const finalBatch = verifiedBatch.filter(item =>
    isValidJobForDispatch(item, isTestMode)
  );

  if (finalBatch.length === 0) {
    console.warn(
      "ℹ️ [Dispatch Blocked] No jobs passed final validation."
    );

    return {
      batchId: null,
      overallStatus: "NO_VERIFIED_JOBS",
      count: 0,
      simulated: false,
      hasRealDelivery: false,
      channelResults: {}
    };
  }

  // -------------------------------------------------------------------
  // Step 5: Generate batch ID
  // -------------------------------------------------------------------

  const batchId =
    "batch_" +
    Date.now() +
    "_" +
    crypto.randomBytes(4).toString("hex");

  console.log("\n==============================================================");
  console.log(
    `📢 [Notification Dispatcher] Batch: ${batchId}`
  );
  console.log(`📦 Verified jobs: ${finalBatch.length}`);
  console.log(
    `🧪 Test mode: ${isTestMode ? "YES" : "NO"}`
  );
  console.log("==============================================================");

  // -------------------------------------------------------------------
  // Step 6: Test mode
  // -------------------------------------------------------------------

  if (isTestMode) {
    const channelResults = {
      email: {
        status: STATUS.SIMULATED,
        simulated: true
      },
      telegram: {
        status: STATUS.SIMULATED,
        simulated: true
      },
      push: {
        status: STATUS.SIMULATED,
        simulated: true
      }
    };

    return {
      batchId,
      overallStatus: STATUS.SIMULATED,
      count: finalBatch.length,
      simulated: true,
      hasRealDelivery: false,
      channelResults
    };
  }

  // -------------------------------------------------------------------
  // Step 7: Dispatch enabled channels independently
  // -------------------------------------------------------------------

  const channelTasks = {
    email: config.notifications.enableEmail
      ? emailService.sendBatch(finalBatch)
      : Promise.resolve({
          skipped: true,
          channel: "email"
        }),

    telegram: config.notifications.enableTelegram
      ? telegramService.sendBatch(finalBatch)
      : Promise.resolve({
          skipped: true,
          channel: "telegram"
        }),

    push: config.notifications.enablePush
      ? pushService.sendBatch(finalBatch)
      : Promise.resolve({
          skipped: true,
          channel: "push"
        })
  };

  const settledResults = await Promise.allSettled(
    CHANNELS.map(channel => channelTasks[channel])
  );

  // -------------------------------------------------------------------
  // Step 8: Normalize channel results
  // -------------------------------------------------------------------

  const channelResults = {};

  CHANNELS.forEach((channel, index) => {
    const result = settledResults[index];

    channelResults[channel] = {
      status: getChannelStatus(result),
      error: getChannelError(result),
      simulated:
        result.status === "fulfilled" &&
        result.value?.simulated === true
    };
  });

  const statuses = CHANNELS.map(
    channel => channelResults[channel].status
  );

  const realSentCount = statuses.filter(
    isRealDelivery
  ).length;

  const failedCount = statuses.filter(
    status => status === STATUS.FAILED
  ).length;

  const skippedCount = statuses.filter(
    status => status === STATUS.SKIPPED
  ).length;

  const simulatedCount = statuses.filter(
    status => status === STATUS.SIMULATED
  ).length;

  const enabledCount = CHANNELS.length - skippedCount;

  // -------------------------------------------------------------------
  // Step 9: Determine overall delivery status
  // -------------------------------------------------------------------

  let overallStatus = STATUS.FAILED;

  if (realSentCount === 0 && simulatedCount > 0) {
    overallStatus = STATUS.SIMULATED;
  } else if (realSentCount === 0 && enabledCount === 0) {
    overallStatus = STATUS.SKIPPED;
  } else if (realSentCount === enabledCount && failedCount === 0) {
    overallStatus = STATUS.SENT;
  } else if (realSentCount > 0) {
    overallStatus = "PARTIAL";
  }

  const hasRealDelivery = realSentCount > 0;

  // -------------------------------------------------------------------
  // Step 10: Log delivery summary
  // -------------------------------------------------------------------

  console.log("\n📊 [Notification Delivery Summary]");

  for (const channel of CHANNELS) {
    const result = channelResults[channel];

    console.log(
      `   • ${channel.toUpperCase()}: ${result.status}` +
      (result.error ? ` (${result.error})` : "")
    );
  }

  console.log(`   • Overall: ${overallStatus}`);
  console.log(`   • Real deliveries: ${realSentCount}`);
  console.log(`   • Simulated channels: ${simulatedCount}`);

  // -------------------------------------------------------------------
  // Step 11: Persist notification audit
  // -------------------------------------------------------------------

  try {
    await recordBatchNotification({
      batchId,
      batch: finalBatch,

      emailStatus: channelResults.email.status,
      emailError: channelResults.email.error,

      telegramStatus: channelResults.telegram.status,
      telegramError: channelResults.telegram.error,

      pushStatus: channelResults.push.status,
      pushError: channelResults.push.error,

      overallStatus
    });
  } catch (error) {
    console.error(
      "⚠️ [Notification Audit] Could not persist delivery record:",
      error.message
    );
  }

  // -------------------------------------------------------------------
  // Step 12: Mark jobs notified ONLY after real delivery
  // -------------------------------------------------------------------

  if (hasRealDelivery) {
    try {
      const recipient =
        config.smtp.receiverEmail ||
        config.candidateEmail ||
        "user";

      await markBatchJobsAsEmailed(
        finalBatch,
        recipient,
        `Batch ${batchId}`
      );

      console.log(
        "✅ [Database] Jobs marked as notified after real delivery."
      );
    } catch (error) {
      console.error(
        "⚠️ [Database] Could not mark jobs as notified:",
        error.message
      );
    }
  } else {
    console.warn(
      "⚠️ [Notification] No real delivery confirmed. " +
      "Jobs will remain eligible for a future notification attempt."
    );
  }

  // -------------------------------------------------------------------
  // Step 13: Return structured result
  // -------------------------------------------------------------------

  return {
    batchId,
    overallStatus,
    count: finalBatch.length,

    simulated: !hasRealDelivery && simulatedCount > 0,
    hasRealDelivery,

    realSentCount,
    failedCount,
    simulatedCount,
    skippedCount,

    channelResults
  };
}

// =====================================================================
// Exports
// =====================================================================

module.exports = {
  dispatchNotificationBatch
};
