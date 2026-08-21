// =====================================================================
// Job Freshness Engine - Validates publication timestamps and age
// =====================================================================

const config = require("../config/env");

const DEFAULT_MAX_JOB_AGE_HOURS = 40.0;

const EXPIRED_PHRASES = [
  "job expired",
  "job is expired",
  "application closed",
  "applications are closed",
  "applications closed",
  "no longer accepting applications",
  "position filled",
  "positions filled",
  "this vacancy is closed",
  "offer expired",
  "position closed",
  "opening closed",
  "job posting has expired",
  "no longer available"
];

/**
 * Calculates programmatic job age in minutes
 * @param {string|Date} publishedAt 
 * @param {Date} [referenceTime=new Date()]
 * @returns {number|null}
 */
function calculateJobAgeMinutes(publishedAt, referenceTime = new Date()) {
  if (!publishedAt) return null;
  const pubDate = new Date(publishedAt);
  if (isNaN(pubDate.getTime())) return null;

  const diffMs = referenceTime.getTime() - pubDate.getTime();
  if (diffMs < 0) {
    // Clock skew protection (job published in future by few seconds/minutes)
    return 0.0;
  }
  return parseFloat((diffMs / (1000 * 60)).toFixed(2));
}

/**
 * Calculates deterministic job age in hours
 * @param {string|Date} publishedAt 
 * @param {Date} [referenceTime=new Date()]
 * @returns {number|null}
 */
function calculateJobAgeHours(publishedAt, referenceTime = new Date()) {
  const mins = calculateJobAgeMinutes(publishedAt, referenceTime);
  if (mins === null) return null;
  return parseFloat((mins / 60).toFixed(2));
}

/**
 * Returns Freshness Score (0-100) and Priority Tier based on job age minutes
 * Priority:
 * 0–5 minutes     → CRITICAL
 * 5–15 minutes    → URGENT
 * 15–30 minutes   → VERY FRESH
 * 30–60 minutes   → FRESH
 * 1–6 hours       → HIGH PRIORITY
 * 6–24 hours      → NORMAL
 * 24–40 hours     → LOW FRESHNESS
 * > 40 hours      → REJECT
 * @param {number|null} jobAgeMinutes 
 * @param {boolean} freshnessVerified
 * @param {number} [maxAllowedHours=40]
 */
function getFreshnessScore(jobAgeMinutes, freshnessVerified = true, maxAllowedHours = config.maxJobAgeHours || DEFAULT_MAX_JOB_AGE_HOURS) {
  if (jobAgeMinutes === null || isNaN(jobAgeMinutes)) {
    return {
      score: 50,
      tier: "UNVERIFIED",
      priorityLabel: "Publication Time Unverified",
      isAcceptable: true,
      freshnessVerified: false
    };
  }

  const jobAgeHours = parseFloat((jobAgeMinutes / 60).toFixed(2));

  // Reject anything older than 40 hours
  if (jobAgeHours > maxAllowedHours) {
    return {
      score: 0,
      tier: "REJECTED_EXPIRED",
      priorityLabel: `Stale (> ${maxAllowedHours}h)`,
      isAcceptable: false,
      reason: `Job is ${jobAgeHours} hours old (exceeds ${maxAllowedHours}h freshness cutoff)`
    };
  }

  // If freshness is not reliably verified, do NOT mark as CRITICAL or URGENT
  if (!freshnessVerified) {
    return {
      score: 65,
      tier: "NORMAL",
      priorityLabel: "Normal (Unverified Date)",
      isAcceptable: true,
      freshnessVerified: false
    };
  }

  // Programmatic Tiers
  if (jobAgeMinutes <= 5.0) {
    return {
      score: 100,
      tier: "CRITICAL",
      priorityLabel: "🚨 CRITICAL (Posted < 5 min ago)",
      isAcceptable: true
    };
  } else if (jobAgeMinutes <= 15.0) {
    return {
      score: 98,
      tier: "URGENT",
      priorityLabel: "🔥 URGENT (Posted 5-15 min ago)",
      isAcceptable: true
    };
  } else if (jobAgeMinutes <= 30.0) {
    return {
      score: 95,
      tier: "VERY_FRESH",
      priorityLabel: "⚡ VERY FRESH (Posted 15-30 min ago)",
      isAcceptable: true
    };
  } else if (jobAgeMinutes <= 60.0) {
    return {
      score: 90,
      tier: "FRESH",
      priorityLabel: "✨ FRESH (Posted 30-60 min ago)",
      isAcceptable: true
    };
  } else if (jobAgeHours <= 6.0) {
    return {
      score: 85,
      tier: "HIGH_PRIORITY",
      priorityLabel: `High Priority (Posted ${Math.round(jobAgeHours)}h ago)`,
      isAcceptable: true
    };
  } else if (jobAgeHours <= 24.0) {
    return {
      score: 75,
      tier: "NORMAL",
      priorityLabel: `Normal (Posted ${Math.round(jobAgeHours)}h ago)`,
      isAcceptable: true
    };
  } else {
    return {
      score: 60,
      tier: "LOW_FRESHNESS",
      priorityLabel: `Low Freshness (Posted ${Math.round(jobAgeHours)}h ago)`,
      isAcceptable: true
    };
  }
}

/**
 * Validates and enriches normalized job with freshness properties and expired status
 * @param {object} job 
 * @param {Date} [referenceTime]
 * @returns {object} { isFresh: boolean, job: object, reason?: string }
 */
function evaluateJobFreshness(job, referenceTime = new Date()) {
  const descLower = (job.description || "").toLowerCase();
  const titleLower = (job.title || "").toLowerCase();

  for (const phrase of EXPIRED_PHRASES) {
    if (descLower.includes(phrase) || titleLower.includes(phrase)) {
      return {
        isFresh: false,
        job: { ...job, jobAgeMinutes: 9999, jobAgeHours: 999, freshnessScore: 0, freshnessTier: "EXPIRED" },
        reason: `Listing contains expired indicator: "${phrase}"`
      };
    }
  }

  const jobAgeMinutes = calculateJobAgeMinutes(job.publishedAt, referenceTime);
  const jobAgeHours = calculateJobAgeHours(job.publishedAt, referenceTime);
  const freshnessMeta = getFreshnessScore(jobAgeMinutes, job.freshnessVerified);

  const updatedJob = {
    ...job,
    jobAgeMinutes,
    jobAgeHours,
    freshnessVerified: freshnessMeta.freshnessVerified !== undefined ? freshnessMeta.freshnessVerified : job.freshnessVerified,
    freshnessScore: freshnessMeta.score,
    freshnessTier: freshnessMeta.tier,
    freshnessLabel: freshnessMeta.priorityLabel || "Unknown"
  };

  if (!freshnessMeta.isAcceptable) {
    return {
      isFresh: false,
      job: updatedJob,
      reason: freshnessMeta.reason || "Failed freshness evaluation"
    };
  }

  return {
    isFresh: true,
    job: updatedJob
  };
}

module.exports = {
  calculateJobAgeMinutes,
  calculateJobAgeHours,
  getFreshnessScore,
  evaluateJobFreshness,
  DEFAULT_MAX_JOB_AGE_HOURS,
  EXPIRED_PHRASES
};

