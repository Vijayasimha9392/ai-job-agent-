// =====================================================================
// Composite Scoring & Priority Routing Engine (Multi-Channel Real-Time)
// =====================================================================

const SOURCE_TRUST_SCORES = {
  "Official company ATS": 100,
  "Official company careers": 100,
  "Official ATS provider": 95,
  "Greenhouse": 95,
  "Lever": 95,
  "Ashby": 95,
  "SmartRecruiters": 95,
  "Workday": 95,
  "SuccessFactors": 95,
  "Major job API": 85,
  "JSearch API": 85,
  "Adzuna": 85,
  "Established aggregator": 75,
  "Arbeitnow": 75,
  "Remotive": 75,
  "Unknown source": 40,
  "Suspicious source": 0
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
 * Match Thresholds:
 * 85–100 → Excellent
 * 75–84  → Strong
 * 65–74  → Good
 * 55–64  → Possible
 * <55    → Reject
 * 
 * Critical Flag:
 * If jobAgeMinutes <= 15 and matchScore >= 80 -> notificationPriority = "CRITICAL"
 * 
 * @param {object} job 
 * @param {object} evaluation 
 * @param {number} [minNotificationThreshold=65]
 */
function determineDispatchPriority(job, evaluation, minNotificationThreshold = 65) {
  const matchScore = evaluation.matchScore || 0;
  const jobAgeMinutes = job.jobAgeMinutes !== null && job.jobAgeMinutes !== undefined ? job.jobAgeMinutes : 9999;
  const isEligible = Boolean(evaluation.isEligible);
  const trustScore = getSourceTrustScore(job.source || job.sourceType);

  // Ineligible or low match (<55) roles are rejected immediately
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

  // 1. Critical Notification Rule: Fresh (<15 min) and High Score (>=80%)
  if (jobAgeMinutes <= 15.0 && matchScore >= 80) {
    return {
      shouldNotify: true,
      shouldEmail: true,
      priorityLevel: "CRITICAL",
      notificationPriority: "CRITICAL",
      badgeText: `🚨 CRITICAL MATCH (${matchScore}% Match • ${Math.round(jobAgeMinutes)}m ago)`,
      badgeColor: "#dc2626",
      emailSubjectPrefix: `🚨 CRITICAL: ${job.title} at ${job.company}`
    };
  }

  // 2. Fast Fresh Pass (15 min fresh with score >= 60, strong role match, high trust)
  const isFastFreshPass = jobAgeMinutes <= 15.0 && matchScore >= 60 && (evaluation.roleMatch || 0) >= 75 && trustScore >= 75;

  // 3. Qualifying matches (>= minNotificationThreshold or fast fresh pass)
  if (matchScore >= minNotificationThreshold || isFastFreshPass) {
    let priorityLevel = "GOOD";
    let badgeText = `✨ Good Match (${matchScore}%)`;
    let badgeColor = "#2563eb";

    if (matchScore >= 85) {
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
      priorityLevel,
      notificationPriority: priorityLevel === "EXCELLENT" ? "HIGH" : "NORMAL",
      badgeText,
      badgeColor,
      emailSubjectPrefix: `🔥 Job Hunter AI — ${matchScore}% Match`
    };
  }

  // Stored without notification if below threshold
  return {
    shouldNotify: false,
    shouldEmail: false,
    priorityLevel: "STORE_ONLY",
    badgeText: `Below Threshold (${matchScore}%)`,
    badgeColor: "#64748b",
    reason: `Match score ${matchScore}/100 is below notification threshold of ${minNotificationThreshold}%`
  };
}

module.exports = {
  calculateOpportunityScore,
  determineDispatchPriority,
  getSourceTrustScore,
  SOURCE_TRUST_SCORES
};

