// =====================================================================
// Job Freshness Engine - Validates publication timestamps and age
// =====================================================================

const config = require("../config/env");

const DEFAULT_MAX_JOB_AGE_HOURS = 24.0;

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
 * Calculates deterministic job age in hours
 * @param {string|Date} publishedAt 
 * @param {Date} [referenceTime=new Date()]
 * @returns {number|null}
 */
function calculateJobAgeHours(publishedAt, referenceTime = new Date()) {
  if (!publishedAt) return null;
  const pubDate = new Date(publishedAt);
  if (isNaN(pubDate.getTime())) return null;

  const diffMs = referenceTime.getTime() - pubDate.getTime();
  if (diffMs < 0) {
    // Clock skew protection (job published in future by few minutes)
    return 0.0;
  }
  return parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
}

/**
 * Returns Freshness Score (0-100) and Priority Tier based on job age
 * @param {number|null} jobAgeHours 
 * @param {boolean} freshnessVerified
 */
function getFreshnessScore(jobAgeHours, freshnessVerified = true, maxAllowedHours = config.maxJobAgeHours || DEFAULT_MAX_JOB_AGE_HOURS) {
  if (!freshnessVerified || jobAgeHours === null || isNaN(jobAgeHours)) {
    return {
      score: 0,
      tier: "UNVERIFIED",
      isAcceptable: false,
      reason: "Publication date could not be verified"
    };
  }

  if (jobAgeHours <= 1.0) {
    return {
      score: 100,
      tier: "URGENT_0_1H",
      priorityLabel: "Urgent (Posted < 1h ago)",
      isAcceptable: true
    };
  } else if (jobAgeHours <= 3.0) {
    return {
      score: 95,
      tier: "PRIORITY_1_3H",
      priorityLabel: "Posted 1-3h ago",
      isAcceptable: true
    };
  } else if (jobAgeHours <= 6.0) {
    return {
      score: 90,
      tier: "PRIORITY_3_6H",
      priorityLabel: "Posted 3-6h ago",
      isAcceptable: true
    };
  } else if (jobAgeHours <= 12.0) {
    return {
      score: 85,
      tier: "PRIORITY_6_12H",
      priorityLabel: "Posted 6-12h ago",
      isAcceptable: true
    };
  } else if (jobAgeHours <= maxAllowedHours) {
    return {
      score: 75,
      tier: "PRIORITY_12_24H",
      priorityLabel: `Posted Recently (< ${maxAllowedHours}h)`,
      isAcceptable: true
    };
  } else {
    return {
      score: 0,
      tier: "REJECTED_EXPIRED",
      priorityLabel: `Stale (> ${maxAllowedHours}h)`,
      isAcceptable: false,
      reason: `Job is ${jobAgeHours} hours old (exceeds ${maxAllowedHours}h freshness cutoff)`
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
        job: { ...job, jobAgeHours: 999, freshnessScore: 0, freshnessTier: "EXPIRED" },
        reason: `Listing contains expired indicator: "${phrase}"`
      };
    }
  }

  const jobAgeHours = calculateJobAgeHours(job.publishedAt, referenceTime);
  const freshnessMeta = getFreshnessScore(jobAgeHours, job.freshnessVerified);

  const updatedJob = {
    ...job,
    jobAgeHours,
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
  calculateJobAgeHours,
  getFreshnessScore,
  evaluateJobFreshness,
  DEFAULT_MAX_JOB_AGE_HOURS,
  EXPIRED_PHRASES
};
