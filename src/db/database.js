// =====================================================================
// Database Layer - PostgreSQL / Supabase & Resilient Persistent Storage
// =====================================================================

const fs = require("fs");
const path = require("path");
const config = require("../config/env");

let Pool = null;
try {
  Pool = require("pg").Pool;
} catch (e) {}

let pool = null;
let isPostgresConnected = false;

// Fallback in-memory/local JSON store if Postgres/Supabase is offline
const localStorePath = path.resolve(__dirname, "../../scratch/local_db.json");
let localDb = {
  pipeline_state: {
    last_run_state: { last_successful_run: null, total_scans: 0, total_matches: 0, total_emails: 0, total_notifications: 0 }
  },
  jobs: {},
  job_fingerprints: {},
  job_evaluations: [],
  notifications: [],
  push_devices: {},
  source_state: {},
  agent_runs: [],
  email_logs: []
};

function loadLocalDb() {
  try {
    if (fs.existsSync(localStorePath)) {
      const data = fs.readFileSync(localStorePath, "utf8");
      localDb = { ...localDb, ...JSON.parse(data) };
      if (!localDb.notifications) localDb.notifications = [];
      if (!localDb.push_devices) localDb.push_devices = {};
      if (!localDb.source_state) localDb.source_state = {};
      if (!localDb.agent_runs) localDb.agent_runs = [];
    }
  } catch (e) {}
}

function saveLocalDb() {
  try {
    const dir = path.dirname(localStorePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(localStorePath, JSON.stringify(localDb, null, 2), "utf8");
  } catch (e) {}
}

async function initDatabase() {
  loadLocalDb();

  if (Pool && !config.database.useSqlite && config.database.url) {
    try {
      pool = new Pool({
        connectionString: config.database.url,
        connectionTimeoutMillis: 4000
      });

      const client = await pool.connect();
      const schemaPath = path.resolve(__dirname, "../../sql/schema.sql");
      const schemaSql = fs.readFileSync(schemaPath, "utf8");
      await client.query(schemaSql);
      client.release();

      isPostgresConnected = true;
      console.log("🐘 [Database] PostgreSQL / Supabase connected successfully.");
      return;
    } catch (err) {
      console.warn(`⚠️ [Database] PostgreSQL connection notice: ${err.message}. Operating in resilient local storage mode.`);
      isPostgresConnected = false;
    }
  } else {
    console.log("📦 [Database] Operating in persistent local file storage mode.");
  }
}

async function hasJobBeenEmailed(fingerprint) {
  return hasJobBeenNotified(fingerprint);
}

async function hasJobBeenNotified(fingerprint) {
  if (isPostgresConnected && pool) {
    try {
      const res = await pool.query(
        "SELECT job_fingerprint FROM job_fingerprints WHERE job_fingerprint = $1 AND (status = 'EMAILED' OR status = 'NOTIFIED' OR notification_status = 'NOTIFIED')",
        [fingerprint]
      );
      return res.rows.length > 0;
    } catch (err) {
      console.error("[Database] Notified check query error:", err.message);
    }
  }
  const rec = localDb.job_fingerprints[fingerprint];
  return rec?.status === "EMAILED" || rec?.status === "NOTIFIED" || rec?.notification_status === "NOTIFIED";
}

async function isDuplicateFingerprint(fingerprint) {
  if (isPostgresConnected && pool) {
    try {
      const res = await pool.query(
        "SELECT job_fingerprint FROM job_fingerprints WHERE job_fingerprint = $1",
        [fingerprint]
      );
      return res.rows.length > 0;
    } catch (err) {
      console.error("[Database] Fingerprint check query error:", err.message);
    }
  }
  return Boolean(localDb.job_fingerprints[fingerprint]);
}

async function saveJobAndFingerprint(job, fingerprint, status = "NEW") {
  const publishedAtDate = job.publishedAt ? new Date(job.publishedAt) : null;
  const discoveredAtDate = job.discoveredAt ? new Date(job.discoveredAt) : new Date();

  if (isPostgresConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO jobs (
          id, job_id, job_fingerprint, source, source_type, company, title, location,
          work_mode, employment_type, description, skills, minimum_experience,
          maximum_experience, education, published_at, discovered_at,
          job_age_minutes, job_age_hours, freshness_verified, application_url, company_careers_url,
          salary, job_reference_id, match_score, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
        [
          job.jobId,
          job.jobId,
          fingerprint,
          job.source,
          job.sourceType || "API",
          job.company,
          job.title,
          job.location,
          job.workMode,
          job.employmentType,
          job.description,
          job.skills,
          job.minimumExperience,
          job.maximumExperience,
          job.education,
          publishedAtDate,
          discoveredAtDate,
          job.jobAgeMinutes,
          job.jobAgeHours,
          job.freshnessVerified,
          job.applicationUrl,
          job.companyCareersUrl,
          job.salary,
          job.jobReferenceId,
          job.matchScore || 0,
          status
        ]
      );

      await pool.query(
        `INSERT INTO job_fingerprints (
          job_fingerprint, job_id, company, title, source, application_url, published_at, discovered_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (job_fingerprint) DO NOTHING`,
        [
          fingerprint,
          job.jobId,
          job.company,
          job.title,
          job.source,
          job.applicationUrl,
          publishedAtDate,
          discoveredAtDate,
          status
        ]
      );
      return;
    } catch (err) {
      console.error("[Database] Job save error:", err.message);
    }
  }

  localDb.jobs[job.jobId] = { ...job, id: job.jobId, job_fingerprint: fingerprint, status };
  localDb.job_fingerprints[fingerprint] = {
    job_fingerprint: fingerprint,
    job_id: job.jobId,
    company: job.company,
    title: job.title,
    source: job.source,
    application_url: job.applicationUrl,
    published_at: job.publishedAt,
    discovered_at: job.discoveredAt,
    first_seen_at: new Date().toISOString(),
    status
  };
  saveLocalDb();
}

async function saveJobEvaluation(jobId, evaluation) {
  if (isPostgresConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO job_evaluations (
          job_id, is_eligible, reject_reason, match_score, match_level,
          role_match, skills_match, experience_match, location_match,
          education_match, freshness_score, matched_skills, missing_skills,
          experience_required, candidate_experience_suitable, why_matched,
          application_priority, confidence, raw_gemini_response
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          jobId,
          evaluation.isEligible,
          evaluation.rejectReason,
          evaluation.matchScore,
          evaluation.matchLevel,
          evaluation.roleMatch,
          evaluation.skillsMatch,
          evaluation.experienceMatch,
          evaluation.locationMatch,
          evaluation.educationMatch,
          evaluation.freshnessScore,
          evaluation.matchedSkills,
          evaluation.missingSkills,
          evaluation.experienceRequired,
          evaluation.candidateExperienceSuitable,
          evaluation.whyMatched,
          evaluation.applicationPriority,
          evaluation.confidence,
          JSON.stringify(evaluation)
        ]
      );
      return;
    } catch (err) {
      console.error("[Database] Evaluation save error:", err.message);
    }
  }

  localDb.job_evaluations.push({
    job_id: jobId,
    ...evaluation,
    created_at: new Date().toISOString()
  });
  saveLocalDb();
}

async function recordBatchNotification(data) {
  const {
    batchId,
    batch,
    emailStatus,
    emailError,
    telegramStatus,
    telegramError,
    pushStatus,
    pushError,
    overallStatus
  } = data;

  const now = new Date();

  for (const item of batch) {
    const { job, fingerprint } = item;
    const notifId = "notif_" + batchId + "_" + (job.jobId || Math.random().toString(36).substring(7));

    if (isPostgresConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO notifications (
            id, batch_id, job_fingerprint, email_status, email_sent_at, email_error,
            telegram_status, telegram_sent_at, telegram_error, push_status, push_sent_at,
            push_error, overall_status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            notifId,
            batchId,
            fingerprint,
            emailStatus,
            emailStatus === "SENT" ? now : null,
            emailError,
            telegramStatus,
            telegramStatus === "SENT" ? now : null,
            telegramError,
            pushStatus,
            pushStatus === "SENT" ? now : null,
            pushError,
            overallStatus
          ]
        );
      } catch (err) {
        console.error("[Database] Notification record error:", err.message);
      }
    } else {
      localDb.notifications.push({
        id: notifId,
        batch_id: batchId,
        job_fingerprint: fingerprint,
        email_status: emailStatus,
        email_sent_at: emailStatus === "SENT" ? now.toISOString() : null,
        email_error: emailError,
        telegram_status: telegramStatus,
        telegram_sent_at: telegramStatus === "SENT" ? now.toISOString() : null,
        telegram_error: telegramError,
        push_status: pushStatus,
        push_sent_at: pushStatus === "SENT" ? now.toISOString() : null,
        push_error: pushError,
        overall_status: overallStatus,
        created_at: now.toISOString()
      });
    }
  }

  saveLocalDb();
}

async function markBatchJobsAsEmailed(batch, recipientEmail, subject) {
  for (const item of batch) {
    const { job, fingerprint, evaluation } = item;
    const matchScore = evaluation?.matchScore || 80;

    if (isPostgresConnected && pool) {
      try {
        await pool.query(
          `UPDATE jobs SET status = 'NOTIFIED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [job.jobId]
        );

        await pool.query(
          `INSERT INTO job_fingerprints (job_fingerprint, job_id, status, notification_status, notified_at, match_score)
           VALUES ($1, $2, 'NOTIFIED', 'NOTIFIED', CURRENT_TIMESTAMP, $3)
           ON CONFLICT (job_fingerprint) DO UPDATE SET status = 'NOTIFIED', notification_status = 'NOTIFIED', notified_at = CURRENT_TIMESTAMP, match_score = $3`,
          [fingerprint, job.jobId, matchScore]
        );
      } catch (err) {
        console.error("[Database] Mark batch jobs error:", err.message);
      }
    } else {
      if (localDb.jobs[job.jobId]) {
        localDb.jobs[job.jobId].status = "NOTIFIED";
      }
      if (localDb.job_fingerprints[fingerprint]) {
        localDb.job_fingerprints[fingerprint].status = "NOTIFIED";
        localDb.job_fingerprints[fingerprint].notification_status = "NOTIFIED";
        localDb.job_fingerprints[fingerprint].notified_at = new Date().toISOString();
        localDb.job_fingerprints[fingerprint].match_score = matchScore;
      } else {
        localDb.job_fingerprints[fingerprint] = {
          job_fingerprint: fingerprint,
          job_id: job.jobId,
          status: "NOTIFIED",
          notification_status: "NOTIFIED",
          notified_at: new Date().toISOString(),
          match_score: matchScore
        };
      }
    }
  }
  saveLocalDb();
}

// Push Device Registration (FCM)
async function registerPushDevice(device) {
  const { userId = "default_user", deviceName = "Web Browser", platform = "web", fcmToken } = device;
  if (!fcmToken) return { success: false, error: "Missing fcmToken" };

  const id = "dev_" + Buffer.from(fcmToken).toString("base64").substring(0, 24).replace(/[^a-zA-Z0-9]/g, "");

  if (isPostgresConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO push_devices (id, user_id, device_name, platform, fcm_token, is_active, updated_at, last_used_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (fcm_token) DO UPDATE SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP, last_used_at = CURRENT_TIMESTAMP`,
        [id, userId, deviceName, platform, fcmToken]
      );
      return { success: true, id };
    } catch (err) {
      console.error("[Database] Register push device error:", err.message);
      return { success: false, error: err.message };
    }
  }

  localDb.push_devices[fcmToken] = {
    id,
    user_id: userId,
    device_name: deviceName,
    platform,
    fcm_token: fcmToken,
    is_active: true,
    created_at: localDb.push_devices[fcmToken]?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_used_at: new Date().toISOString()
  };
  saveLocalDb();
  return { success: true, id };
}

async function deactivatePushDevice(fcmToken) {
  if (isPostgresConnected && pool) {
    try {
      await pool.query(
        "UPDATE push_devices SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE fcm_token = $1",
        [fcmToken]
      );
      return;
    } catch (err) {}
  }
  if (localDb.push_devices[fcmToken]) {
    localDb.push_devices[fcmToken].is_active = false;
    localDb.push_devices[fcmToken].updated_at = new Date().toISOString();
    saveLocalDb();
  }
}

async function getActivePushDevices() {
  if (isPostgresConnected && pool) {
    try {
      const res = await pool.query("SELECT * FROM push_devices WHERE is_active = TRUE");
      return res.rows;
    } catch (err) {}
  }
  return Object.values(localDb.push_devices).filter(d => d.is_active);
}

// Source Health & Polling State
async function updateSourceState(sourceName, tier, jobCount = 0, error = null) {
  if (isPostgresConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO source_state (source_name, tier, last_successful_run, total_jobs_fetched, last_error)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4)
         ON CONFLICT (source_name) DO UPDATE SET 
           tier = $2, 
           last_successful_run = CURRENT_TIMESTAMP, 
           total_jobs_fetched = source_state.total_jobs_fetched + $3,
           last_error = $4`,
        [sourceName, tier, jobCount, error]
      );
      return;
    } catch (err) {}
  }

  const existing = localDb.source_state[sourceName] || { total_jobs_fetched: 0 };
  localDb.source_state[sourceName] = {
    source_name: sourceName,
    tier,
    last_successful_run: new Date().toISOString(),
    total_jobs_fetched: (existing.total_jobs_fetched || 0) + jobCount,
    last_error: error
  };
  saveLocalDb();
}

async function recordAgentRun(runData) {
  const { runId, tier, durationMs, sourcesPolled, jobsDiscovered, jobsFresh, jobsPassedFilter, jobsEvaluated, jobsQualified, notificationsSent, errors } = runData;
  if (isPostgresConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO agent_runs (
          run_id, tier, duration_ms, sources_polled, jobs_discovered, jobs_fresh,
          jobs_passed_filter, jobs_evaluated, jobs_qualified, notifications_sent, errors, completed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP)`,
        [
          runId,
          tier,
          durationMs,
          JSON.stringify(sourcesPolled || []),
          jobsDiscovered,
          jobsFresh,
          jobsPassedFilter,
          jobsEvaluated,
          jobsQualified,
          notificationsSent,
          JSON.stringify(errors || [])
        ]
      );
      return;
    } catch (err) {}
  }

  localDb.agent_runs.push({
    run_id: runId,
    tier,
    duration_ms: durationMs,
    sources_polled: sourcesPolled,
    jobs_discovered: jobsDiscovered,
    jobs_fresh: jobsFresh,
    jobs_passed_filter: jobsPassedFilter,
    jobs_evaluated: jobsEvaluated,
    jobs_qualified: jobsQualified,
    notifications_sent: notificationsSent,
    completed_at: new Date().toISOString()
  });
  saveLocalDb();
}

async function getRecentNotifiedJobs(limit = 20) {
  if (isPostgresConnected && pool) {
    try {
      const res = await pool.query(
        "SELECT * FROM jobs WHERE status = 'NOTIFIED' ORDER BY published_at DESC LIMIT $1",
        [limit]
      );
      return res.rows;
    } catch (err) {}
  }
  return Object.values(localDb.jobs)
    .filter(j => j.status === "NOTIFIED")
    .sort((a, b) => new Date(b.publishedAt || b.discoveredAt) - new Date(a.publishedAt || a.discoveredAt))
    .slice(0, limit);
}

async function getPipelineState() {
  if (isPostgresConnected && pool) {
    try {
      const res = await pool.query(
        "SELECT value FROM pipeline_state WHERE key = 'last_run_state'"
      );
      if (res.rows.length > 0) return res.rows[0].value;
    } catch (err) {}
  }
  return localDb.pipeline_state.last_run_state;
}

async function updatePipelineState(newState) {
  if (isPostgresConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO pipeline_state (key, value, updated_at)
         VALUES ('last_run_state', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(newState)]
      );
      return;
    } catch (err) {}
  }

  localDb.pipeline_state.last_run_state = {
    ...localDb.pipeline_state.last_run_state,
    ...newState
  };
  saveLocalDb();
}

module.exports = {
  initDatabase,
  isDuplicateFingerprint,
  hasJobBeenEmailed,
  hasJobBeenNotified,
  saveJobAndFingerprint,
  saveJobEvaluation,
  recordBatchNotification,
  markBatchJobsAsEmailed,
  registerPushDevice,
  deactivatePushDevice,
  getActivePushDevices,
  updateSourceState,
  recordAgentRun,
  getRecentNotifiedJobs,
  getPipelineState,
  updatePipelineState
};
