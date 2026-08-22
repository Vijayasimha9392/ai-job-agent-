// =====================================================================
// Composite Scoring & Priority Routing Engine (Strict Freshness-First)
// =====================================================================

const SOURCE_TRUST_SCORES = {
  "Official company ATS": 100,
  "Official company careers": 100,
  "Official ATS": 95,
  "Greenhouse": 95,
  "Lever": 95,
  "Ashby": 95,
  "SmartRecruiters": 95,
  "Workday": 95,
  "Major Job API": 85,
  "JSearch": 85,
  "Adzuna": 85,
  "Career Feed": 70,
  "Unknown source": 40
};

/**
 * Calculates source trust score
 * @param {string} sourceName 
 * @returns {number}
 */
function getSourceTrustScore(sourceName) {
  if (!sourceName) return 40;
  for (const [key, val] of Object.entries(SOURCE_TRUST_SCORES)) {
    if (sourceName.toLowerCase().includes(key.toLowerCase())) {
      return val;
    }
  }
  return 40;
}

/**
 * Computes composite Opportunity Score
 * OpportunityScore = (MatchScore * 0.65) + (FreshnessScore * 0.25) + (SourceTrustScore * 0.10)
 * @param {number} matchScore
 * @param {number} freshnessScore
 * @param {string} sourceName
 */
function calculateOpportunityScore(matchScore = 0, freshnessScore = 0, sourceName = "Unknown") {
  const trustScore = getSourceTrustScore(sourceName);
  const oppScore = (matchScore * 0.65) + (freshnessScore * 0.25) + (trustScore * 0.10);
  return {
    opportunityScore: Math.round(oppScore),
    sourceTrustScore: trustScore
  };
}

/**
 * Evaluates urgency tier and multi-channel notification dispatch decision
 * Strict Freshness Policy Tiers:
 * Tier 1 (0–1 hour):     Notify immediately (min score 60%)
 * Tier 2 (1–6 hours):    Notify with high priority (min score 65%)
 * Tier 3 (6–12 hours):   Notify normally (min score 68%)
 * Tier 4 (12–24 hours):  Notify only when genuinely suitable (min score 70%)
 * Tier 5 (24–30 hours):  Include only when strongly matched (min score 75%)
 * >30 hours:             Strictly REJECT
 *
 * @param {object} job 
 * @param {object} evaluation 
 * @param {number} [minNotificationThreshold=65]
 */
function determineDispatchPriority(job, evaluation, minNotificationThreshold = 65) {
  const matchScore = evaluation.matchScore || 0;
  const jobAgeHours = job.jobAgeHours !== null && job.jobAgeHours !== undefined ? job.jobAgeHours : 999;
  const jobAgeMinutes = job.jobAgeMinutes !== null && job.jobAgeMinutes !== undefined ? job.jobAgeMinutes : 9999;
  const isEligible = Boolean(evaluation.isEligible);
  const trustScore = getSourceTrustScore(job.source || job.sourceType);

  // 1. ABSOLUTE AGE CUTOFF: Strictly reject > 30 hours
  if (jobAgeHours > 30.0) {
    return {
      shouldNotify: false,
      shouldEmail: false,
      priorityLevel: "REJECTED_AGE",
      badgeText: "Rejected (>30h old)",
      badgeColor: "#ef4444",
      reason: `Job is ${jobAgeHours}h old, which exceeds the absolute 30-hour freshness cutoff.`
    };
  }

  // 2. Ineligible or low match (<55) roles are rejected immediately
  if (!isEligible || matchScore < 55) {
    return {
      shouldNotify: false,
      shouldEmail: false,
      priorityLevel: "REJECTED",
      badgeText: "Ineligible",
      badgeColor: "#ef4444",
      reason: evaluation.rejectReason || "Match score < 55 or role ineligible"
    };
  }

  // 3. Dynamic Qualification Thresholds based on Age Tiers
  let dynamicMinScore = minNotificationThreshold;
  if (jobAgeHours <= 1.0) {
    dynamicMinScore = 60; // Tier 1: Fastest early application advantage
  } else if (jobAgeHours <= 6.0) {
    dynamicMinScore = 65; // Tier 2
  } else if (jobAgeHours <= 12.0) {
    dynamicMinScore = 68; // Tier 3
  } else if (jobAgeHours <= 24.0) {
    dynamicMinScore = 70; // Tier 4
  } else {
    dynamicMinScore = 75; // Tier 5 (24-30h requires strong match >=75%)
  }

  // 4. Critical Push Alert: <= 30 minutes and score >= 70
  const isCriticalPush = jobAgeMinutes <= 30.0 && matchScore >= 70;

  if (matchScore >= dynamicMinScore) {
    let priorityLevel = "GOOD";
    let badgeText = `✨ Good Match (${matchScore}%)`;
    let badgeColor = "#2563eb";

    if (isCriticalPush) {
      priorityLevel = "CRITICAL";
      badgeText = `🚨 CRITICAL (${matchScore}% Match • ${Math.round(jobAgeMinutes)}m ago)`;
      badgeColor = "#dc2626";
    } else if (matchScore >= 85) {
      priorityLevel = "EXCELLENT";
      badgeText = `💎 TOP MATCH (${matchScore}%)`;
      badgeColor = "#16a34a";
    } else if (matchScore >= 75) {
      priorityLevel = "STRONG";
      badgeText = `⚡ Strong Match (${matchScore}%)`;
      badgeColor = "#0284c7";
    }

    return {
      shouldNotify: true,
      shouldEmail: true,
      isCriticalPush,
      priorityLevel,
      notificationPriority: isCriticalPush ? "CRITICAL" : (priorityLevel === "EXCELLENT" ? "HIGH" : "NORMAL"),
      badgeText,
      badgeColor,
      emailSubjectPrefix: isCriticalPush ? `🚨 CRITICAL: ${job.title} at ${job.company}` : `🔥 Job Hunter AI — ${matchScore}% Match`
    };
  }

  // Stored without notification if below tier threshold
  return {
    shouldNotify: false,
    shouldEmail: false,
    priorityLevel: "STORE_ONLY",
    badgeText: `Below Tier Threshold (${matchScore}%)`,
    badgeColor: "#64748b",
    reason: `Match score ${matchScore}/100 is below age-tier minimum threshold of ${dynamicMinScore}%`
  };
}

/**
 * Strictly sorts jobs by Freshness First (publishedAt DESC), then Match Score DESC, then Trust DESC
 * @param {Array<{job: object, evaluation: object}>} items 
 * @returns {Array<{job: object, evaluation: object}>}
 */
function sortJobsByFreshnessFirst(items = []) {
  return [...items].sort((a, b) => {
    const jobA = a.job || a;
    const jobB = b.job || b;

    const timeA = jobA.publishedAt ? new Date(jobA.publishedAt).getTime() : 0;
    const timeB = jobB.publishedAt ? new Date(jobB.publishedAt).getTime() : 0;

    // 1. Primary sort: Publication Time DESC (Newest first)
    const timeDiff = timeB - timeA;
    const tenMinutesMs = 10 * 60 * 1000;

    // If publication timestamps differ by more than 10 minutes, newest wins unconditionally
    if (Math.abs(timeDiff) > tenMinutesMs) {
      return timeDiff;
    }

    // 2. Secondary sort: Match Score DESC (Highest score wins for jobs posted around the same time)
    const scoreA = a.evaluation?.matchScore || jobA.matchScore || 0;
    const scoreB = b.evaluation?.matchScore || jobB.matchScore || 0;
    const scoreDiff = scoreB - scoreA;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    // 3. Tertiary sort: Source Trust Score DESC
    const trustA = getSourceTrustScore(jobA.source || jobA.sourceType);
    const trustB = getSourceTrustScore(jobB.source || jobB.sourceType);
    return trustB - trustA;
  });
}

module.exports = {
  calculateOpportunityScore,
  determineDispatchPriority,
  getSourceTrustScore,
  sortJobsByFreshnessFirst,
  SOURCE_TRUST_SCORES
};
