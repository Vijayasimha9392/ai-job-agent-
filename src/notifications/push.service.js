// =====================================================================
// Push Notification Service - Firebase Cloud Messaging (FCM)
// =====================================================================

const config = require("../config/env");
const { getActivePushDevices, deactivatePushDevice } = require("../db/database");

let admin = null;
let fcmApp = null;

function getFirebaseAdmin() {
  if (fcmApp) return admin;

  try {
    admin = require("firebase-admin");
    const { projectId, clientEmail, privateKey } = config.firebase;

    if (projectId && clientEmail && privateKey && !privateKey.includes("your_firebase_private_key")) {
      fcmApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
      console.log("🔥 [Push Service] Firebase Admin SDK initialized successfully.");
    }
  } catch (err) {
    console.warn("⚠️ [Push Service] Firebase Admin SDK initialization notice:", err.message);
  }

  return admin;
}

/**
 * Formats push notification payload based on batch size
 */
function formatPushPayload(batch) {
  if (batch.length === 1) {
    const { job, evaluation, dispatchMeta } = batch[0];
    const isCritical = dispatchMeta?.priorityLevel === "CRITICAL" || (job.jobAgeMinutes !== null && job.jobAgeMinutes <= 15);
    const ageStr = job.jobAgeMinutes !== null 
      ? (job.jobAgeMinutes < 60 ? `${Math.round(job.jobAgeMinutes)} min ago` : `${Math.round(job.jobAgeHours)}h ago`)
      : "Just now";

    return {
      title: isCritical ? `🚨 ${job.title} — ${evaluation.matchScore}% Match` : `⚡ ${job.title} — ${evaluation.matchScore}% Match`,
      body: `${job.company} • ${job.location} • Posted ${ageStr}`,
      data: {
        url: job.applicationUrl || "",
        jobId: String(job.jobId || ""),
        matchScore: String(evaluation.matchScore || ""),
        priority: isCritical ? "CRITICAL" : "HIGH"
      }
    };
  }

  // Multiple jobs
  const topJob = batch.reduce((prev, current) => (prev.evaluation?.matchScore > current.evaluation?.matchScore ? prev : current), batch[0]);
  const hasCritical = batch.some(b => b.dispatchMeta?.priorityLevel === "CRITICAL" || (b.job?.jobAgeMinutes !== null && b.job?.jobAgeMinutes <= 15));

  return {
    title: hasCritical ? `🚨 ${batch.length} New Jobs Found (Critical)` : `🔥 ${batch.length} New Job Matches Found`,
    body: `Top match: ${topJob.job.title} at ${topJob.job.company} — ${topJob.evaluation.matchScore}%`,
    data: {
      url: topJob.job.applicationUrl || "",
      batchCount: String(batch.length),
      topJobId: String(topJob.job.jobId || "")
    }
  };
}

/**
 * Multicasts push notification to all active device tokens
 * @param {Array<{job: object, fingerprint: string, evaluation: object, dispatchMeta: object}>} batch
 * @returns {Promise<{ success: boolean, recipientCount?: number, simulated?: boolean, error?: string }>}
 */
async function sendBatch(batch = []) {
  const count = batch.length;
  if (count === 0) {
    return { success: true, count: 0, reason: "No jobs in batch" };
  }

  const payload = formatPushPayload(batch);
  const devices = await getActivePushDevices();

  if (!devices || devices.length === 0) {
    console.log(`📱 [Push Service (Simulation)] No registered push devices found. Broadcast payload:`);
    console.log(`   Title: ${payload.title}`);
    console.log(`   Body:  ${payload.body}`);
    return { success: true, simulated: true, count, recipientCount: 0 };
  }

  const fbAdmin = getFirebaseAdmin();
  if (!fbAdmin || !fcmApp) {
    console.log(`📱 [Push Service (Simulation)] Firebase credentials not configured. Payload simulated for ${devices.length} registered devices.`);
    return { success: true, simulated: true, count, recipientCount: devices.length };
  }

  const tokens = devices.map(d => d.fcm_token).filter(Boolean);
  if (tokens.length === 0) {
    return { success: true, recipientCount: 0 };
  }

  try {
    const messaging = fbAdmin.messaging();
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: payload.data,
      webpush: {
        fcmOptions: {
          link: payload.data.url
        }
      }
    });

    console.log(`🚀 [Push Service] Multicast dispatched: ${response.successCount} succeeded, ${response.failureCount} failed.`);

    // Clean up dead / unregistered tokens
    if (response.failureCount > 0) {
      for (let idx = 0; idx < response.responses.length; idx++) {
        const resp = response.responses[idx];
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === "messaging/registration-token-not-registered" ||
            errorCode === "messaging/invalid-registration-token"
          ) {
            const deadToken = tokens[idx];
            console.log(`🗑️ [Push Service] Deactivating stale/invalid FCM token: ${deadToken.substring(0, 16)}...`);
            await deactivatePushDevice(deadToken);
          }
        }
      }
    }

    return {
      success: response.successCount > 0 || response.failureCount === 0,
      recipientCount: response.successCount,
      count
    };
  } catch (err) {
    console.error(`❌ [Push Service] FCM Multicast dispatch error: ${err.message}`);
    return { success: false, error: err.message, count };
  }
}

module.exports = {
  sendBatch,
  formatPushPayload,
  getFirebaseAdmin
};
