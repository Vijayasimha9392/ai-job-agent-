// =====================================================================
// Job Freshness Engine - Strict 30-Hour Cutoff & Early Application Hierarchy
// =====================================================================

const config = require("../config/env");

const DEFAULT_MAX_JOB_AGE_HOURS = 30.0;

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
 * Calculates programmatic job age in milliseconds
 * @param {string|Date} publishedAt 
 * @param {Date} [referenceTime=new Date()]
 * @returns {number|null}
 */
function calculateJobAgeMilliseconds(publishedAt, referenceTime = new Date()) {
  if (!publishedAt) return null;
  const pubDate = new Date(publishedAt);
  if (isNaN(pubDate.getTime())) return null;

  const diffMs = referenceTime.getTime() - pubDate.getTime();
  return diffMs < 0 ? 0.0 : diffMs;
}

/**
 * Calculates programmatic job age in minutes
 * @param {string|Date} publishedAt 
 * @param {Date} [referenceTime=new Date()]
 * @returns {number|null}
 */
function calculateJobAgeMinutes(publishedAt, referenceTime = new Date()) {
  const ms = calculateJobAgeMilliseconds(publishedAt, referenceTime);
  if (ms === null) return null;
  return parseFloat((ms / 60000).toFixed(2));
}

/**
 * Calculates deterministic job age in hours
 * @param {string|Date} publishedAt 
 * @param {Date} [referenceTime=new Date()]
 * @returns {number|null}
 */
function calculateJobAgeHours(publishedAt, referenceTime = new Date()) {
  const ms = calculateJobAgeMilliseconds(publishedAt, referenceTime);
  if (ms === null) return null;
  return parseFloat((ms / 3600000).toFixed(2));
}

/**
 * Returns Freshness Score (0-100) and Priority Tier based on job age
 * Strict Hierarchy:
 * 0–5 minutes     → HIGHEST PRIORITY (100)
 * 5–15 minutes    → CRITICAL (98)
 * 15–30 minutes   → VERY HIGH PRIORITY (95)
 * 30–60 minutes   → HIGH PRIORITY (90)
 * 1–3 hours       → VERY FRESH (85)
 * 3–6 hours       → FRESH (80)
 * 6–12 hours      → RECENT (75)
 * 12–24 hours     → ACCEPTABLE (70)
 * 24–30 hours     → LOWEST ACCEPTABLE (60)
 * > 30 hours      → REJECT (0)
 *
 * @param {number|null} jobAgeMinutes 
 * @param {boolean} freshnessVerified
 * @param {number} [maxAllowedHours=30]
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

  // ABSOLUTE MAXIMUM AGE: Reject anything older than 30 hours
  if (jobAgeHours > maxAllowedHours) {
    return {
      score: 0,
      tier: "REJECTED_EXPIRED",
      priorityLabel: `Stale (> ${maxAllowedHours}h cutoff)`,
      isAcceptable: false,
      reason: `Job is ${jobAgeHours} hours old (exceeds absolute ${maxAllowedHours}h freshness cutoff)`
    };
  }

  // If freshness timestamp is not verified, do NOT award Tier 1/2 priority
  if (!freshnessVerified) {
    return {
      score: 60,
      tier: "NORMAL",
      priorityLabel: "Normal (Unverified Date)",
      isAcceptable: true,
      freshnessVerified: false
    };
  }

  // Programmatic Freshness Tiers
  if (jobAgeMinutes <= 5.0) {
    return {
      score: 100,
      tier: "HIGHEST_PRIORITY",
      priorityLabel: "🚨 HIGHEST PRIORITY (Posted < 5 min ago)",
      isAcceptable: true
    };
  } else if (jobAgeMinutes <= 15.0) {
    return {
      score: 98,
      tier: "CRITICAL",
      priorityLabel: "🔥 CRITICAL (Posted 5-15 min ago)",
      isAcceptable: true
    };
  } else if (jobAgeMinutes <= 30.0) {
    return {
      score: 95,
      tier: "VERY_HIGH_PRIORITY",
      priorityLabel: "⚡ VERY HIGH PRIORITY (Posted 15-30 min ago)",
      isAcceptable: true
    };
  } else if (jobAgeMinutes <= 60.0) {
    return {
      score: 90,
      tier: "HIGH_PRIORITY",
      priorityLabel: "✨ HIGH PRIORITY (Posted 30-60 min ago)",
      isAcceptable: true
    };
  } else if (jobAgeHours <= 3.0) {
    return {
      score: 85,
      tier: "VERY_FRESH",
      priorityLabel: `🌟 VERY FRESH (Posted ${Math.round(jobAgeHours)}h ago)`,
      isAcceptable: true
    };
  } else if (jobAgeHours <= 6.0) {
    return {
      score: 80,
      tier: "FRESH",
      priorityLabel: `🟢 FRESH (Posted ${Math.round(jobAgeHours)}h ago)`,
      isAcceptable: true
    };
  } else if (jobAgeHours <= 12.0) {
    return {
      score: 75,
      tier: "RECENT",
      priorityLabel: `🕒 RECENT (Posted ${Math.round(jobAgeHours)}h ago)`,
      isAcceptable: true
    };
  } else if (jobAgeHours <= 24.0) {
    return {
      score: 70,
      tier: "ACCEPTABLE",
      priorityLabel: `📅 ACCEPTABLE (Posted ${Math.round(jobAgeHours)}h ago)`,
      isAcceptable: true
    };
  } else {
    return {
      score: 60,
      tier: "LOWEST_ACCEPTABLE",
      priorityLabel: `⏳ LOWEST ACCEPTABLE (Posted ${Math.round(jobAgeHours)}h ago)`,
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

  const jobAgeMilliseconds = calculateJobAgeMilliseconds(job.publishedAt, referenceTime);
  const jobAgeMinutes = calculateJobAgeMinutes(job.publishedAt, referenceTime);
  const jobAgeHours = calculateJobAgeHours(job.publishedAt, referenceTime);
  const freshnessMeta = getFreshnessScore(jobAgeMinutes, job.freshnessVerified);

  const updatedJob = {
    ...job,
    jobAgeMilliseconds,
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
      reason: freshnessMeta.reason || "Failed freshness evaluation (exceeds 30h maximum age)"
    };
  }

  return {
    isFresh: true,
    job: updatedJob
  };
}

module.exports = {
  calculateJobAgeMilliseconds,
  calculateJobAgeMinutes,
  calculateJobAgeHours,
  getFreshnessScore,
  evaluateJobFreshness,
  DEFAULT_MAX_JOB_AGE_HOURS,
  EXPIRED_PHRASES
};
