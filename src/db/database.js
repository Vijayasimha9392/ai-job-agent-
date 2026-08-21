// =====================================================================
// Database Layer - PostgreSQL client with robust fallback (Zero Dependency Ready)
// =====================================================================

const fs = require("fs");
const path = require("path");
const config = require("../config/env");

let Pool = null;
try {
  Pool = require("pg").Pool;
} catch (e) {
  // pg module not installed; fallback to local persistence
}

let pool = null;
let isPostgresConnected = false;

// Fallback in-memory/local JSON store if Postgres is offline
const localStorePath = path.resolve(__dirname, "../../scratch/local_db.json");
let localDb = {
  pipeline_state: {
    last_run_state: { last_successful_run: null, total_scans: 0, total_matches: 0, total_emails: 0 }
  },
  jobs: {},
  job_fingerprints: {},
  job_evaluations: [],
  email_logs: []
};

function loadLocalDb() {
  try {
    if (fs.existsSync(localStorePath)) {
      const data = fs.readFileSync(localStorePath, "utf8");
      localDb = JSON.parse(data);
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
      console.log("🐘 [Database] PostgreSQL connected successfully.");
      return;
    } catch (err) {
      console.warn(`⚠️ [Database] PostgreSQL connection failed: ${err.message}. Operating in resilient local storage mode.`);
      isPostgresConnected = false;
    }
  } else {
    console.log("📦 [Database] Operating in persistent local file storage mode.");
  }
}

async function hasJobBeenEmailed(fingerprint) {
  if (isPostgresConnected && pool) {
    try {
      const res = await pool.query(
        "SELECT job_fingerprint FROM job_fingerprints WHERE job_fingerprint = $1 AND status = 'EMAILED'",
        [fingerprint]
      );
      return res.rows.length > 0;
    } catch (err) {
      console.error("[Database] Emailed check query error:", err.message);
    }
  }
  return localDb.job_fingerprints[fingerprint]?.status === "EMAILED";
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
  if (isPostgresConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO jobs (
          job_id, job_fingerprint, source, company, title, location,
          work_mode, employment_type, description, skills, minimum_experience,
          maximum_experience, education, published_at, discovered_at,
          job_age_hours, freshness_verified, application_url, company_careers_url,
          salary, job_reference_id, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (job_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
        [
          job.jobId,
          fingerprint,
          job.source,
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
          job.publishedAt,
          job.discoveredAt,
          job.jobAgeHours,
          job.freshnessVerified,
          job.applicationUrl,
          job.companyCareersUrl,
          job.salary,
          job.jobReferenceId,
          status
        ]
      );

      await pool.query(
        `INSERT INTO job_fingerprints (
          job_fingerprint, job_id, company, title, application_url, published_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (job_fingerprint) DO NOTHING`,
        [
          fingerprint,
          job.jobId,
          job.company,
          job.title,
          job.applicationUrl,
          job.publishedAt,
          status
        ]
      );
      return;
    } catch (err) {
      console.error("[Database] Job save error:", err.message);
    }
  }

  localDb.jobs[job.jobId] = { ...job, job_fingerprint: fingerprint, status };
  localDb.job_fingerprints[fingerprint] = {
    job_fingerprint: fingerprint,
    job_id: job.jobId,
    company: job.company,
    title: job.title,
    application_url: job.applicationUrl,
    published_at: job.publishedAt,
    first_detected_at: new Date().toISOString(),
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

async function logEmailSent(jobId, fingerprint, recipientEmail, subject, matchScore, priority, status = "SENT", error = null) {
  if (isPostgresConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO email_logs (job_id, recipient_email, subject, match_score, application_priority, delivery_status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [jobId, recipientEmail, subject, matchScore, priority, status, error]
      );

      await pool.query(
        `UPDATE jobs SET status = 'EMAILED', updated_at = CURRENT_TIMESTAMP WHERE job_id = $1`,
        [jobId]
      );

      await pool.query(
        `INSERT INTO job_fingerprints (job_fingerprint, job_id, status, email_sent_at, match_score)
         VALUES ($1, $2, 'EMAILED', CURRENT_TIMESTAMP, $3)
         ON CONFLICT (job_fingerprint) DO UPDATE SET status = 'EMAILED', email_sent_at = CURRENT_TIMESTAMP, match_score = $3`,
        [fingerprint, jobId, matchScore]
      );
      return;
    } catch (err) {
      console.error("[Database] Email log error:", err.message);
    }
  }

  localDb.email_logs.push({
    job_id: jobId,
    recipient_email: recipientEmail,
    subject,
    match_score: matchScore,
    application_priority: priority,
    sent_at: new Date().toISOString(),
    delivery_status: status,
    error_message: error
  });

  if (localDb.jobs[jobId]) localDb.jobs[jobId].status = "EMAILED";
  if (localDb.job_fingerprints[fingerprint]) {
    localDb.job_fingerprints[fingerprint].status = "EMAILED";
    localDb.job_fingerprints[fingerprint].email_sent_at = new Date().toISOString();
    localDb.job_fingerprints[fingerprint].match_score = matchScore;
  } else {
    localDb.job_fingerprints[fingerprint] = {
      job_fingerprint: fingerprint,
      job_id: jobId,
      status: "EMAILED",
      email_sent_at: new Date().toISOString(),
      match_score: matchScore
    };
  }
  saveLocalDb();
}

async function markBatchJobsAsEmailed(jobsWithMeta, recipientEmail, subject) {
  for (const item of jobsWithMeta) {
    const { job, fingerprint, evaluation, dispatchMeta } = item;
    await logEmailSent(
      job.jobId,
      fingerprint,
      recipientEmail,
      subject,
      evaluation.matchScore,
      dispatchMeta.priorityLevel,
      "SENT"
    );
  }
}

async function getPipelineState() {
  if (isPostgresConnected && pool) {
    try {
      const res = await pool.query(
        "SELECT value FROM pipeline_state WHERE key = 'last_run_state'"
      );
      if (res.rows.length > 0) return res.rows[0].value;
    } catch (err) {
      console.error("[Database] Pipeline state read error:", err.message);
    }
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
    } catch (err) {
      console.error("[Database] Pipeline state write error:", err.message);
    }
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
  saveJobAndFingerprint,
  saveJobEvaluation,
  logEmailSent,
  markBatchJobsAsEmailed,
  getPipelineState,
  updatePipelineState
};
