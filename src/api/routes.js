// =====================================================================
// API Routes - Web Push Registration, Live Job Feed, and System Health
// =====================================================================

const express = require("express");
const router = express.Router();
const { 
  registerPushDevice, 
  deactivatePushDevice, 
  getActivePushDevices, 
  getRecentNotifiedJobs, 
  getPipelineState 
} = require("../db/database");
const config = require("../config/env");

/**
 * POST /api/push/register
 * Registers an FCM token for browser / mobile push notifications
 */
router.post("/push/register", async (req, res) => {
  try {
    const { fcmToken, deviceName, platform, userId } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ error: "Missing required 'fcmToken' field in body." });
    }

    const result = await registerPushDevice({
      fcmToken,
      deviceName: deviceName || "Web Browser",
      platform: platform || "web",
      userId: userId || "candidate_user"
    });

    return res.status(200).json({
      success: true,
      message: "FCM push device registered successfully",
      deviceId: result.id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/push/unregister
 * Deactivates an FCM push token
 */
router.post("/push/unregister", async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ error: "Missing 'fcmToken' parameter" });
    }

    await deactivatePushDevice(fcmToken);
    return res.status(200).json({ success: true, message: "FCM token unregistered" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/recent
 * Returns the most recent notified qualifying jobs
 */
router.get("/jobs/recent", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "20", 10);
    const jobs = await getRecentNotifiedJobs(limit);
    return res.status(200).json({ count: jobs.length, jobs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /health
 * System health, channel status, and metrics
 */
router.get("/health", async (req, res) => {
  try {
    const state = await getPipelineState();
    const activeDevices = await getActivePushDevices();

    return res.status(200).json({
      status: "HEALTHY",
      agent: "Job Hunter AI (Near Real-Time)",
      candidate: config.candidateName,
      timezone: config.timezone,
      channels: {
        email: { enabled: config.notifications.enableEmail, user: config.smtp.user ? "configured" : "unconfigured" },
        telegram: { enabled: config.notifications.enableTelegram, bot: config.telegram.botToken ? "configured" : "unconfigured" },
        push: { enabled: config.notifications.enablePush, activeDevices: activeDevices.length }
      },
      pollingCadence: {
        fastTierMinutes: config.polling.fastMinutes,
        normalTierMinutes: config.polling.normalMinutes,
        aggregationMinutes: config.polling.aggregationWindowMinutes
      },
      stats: state,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ status: "DEGRADED", error: err.message });
  }
});

module.exports = router;
