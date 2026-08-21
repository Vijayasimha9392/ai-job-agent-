// =====================================================================
// Composite Scoring & Priority Routing Engine
// =====================================================================

const SOURCE_TRUST_SCORES = {
  "Company Career Portal": 100,
  "Workday": 95,
  "Greenhouse": 95,
  "Lever": 95,
  "SmartRecruiters": 95,
  "Ashby": 95,
  "LinkedIn": 85,
  "Naukri": 85,
  "Indeed": 85,
  "JSearch API": 80,
  "Adzuna": 80,
  "Arbeitnow": 80,
  "Remotive": 80,
  "RSS Feed": 75,
  "Aggregator": 50,
  "Custom": 70
};

/**
 * Calculates source trust score
 */
function getSourceTrustScore(sourceName) {
  if (!sourceName) return 60;
  for (const [key, val] of Object.entries(SOURCE_TRUST_SCORES)) {
    if (sourceName.toLowerCase().includes(key.toLowerCase())) {
      return val;
    }
  }
  return 60;
}

/**
 * Computes composite Opportunity Score
 * OpportunityScore = (MatchScore * 0.70) + (FreshnessScore * 0.20) + (SourceTrustScore * 0.10)
 */
function calculateOpportunityScore(matchScore, freshnessScore, sourceName) {
  const trustScore = getSourceTrustScore(sourceName);
  const oppScore = (matchScore * 0.70) + (freshnessScore * 0.20) + (trustScore * 0.10);
  return {
    opportunityScore: Math.round(oppScore),
    sourceTrustScore: trustScore
  };
}

/**
 * Evaluates urgency tier and email dispatch decision
 * STRICT RULE: Only dispatch emails if matchScore >= 80 and isEligible is true
 * @param {object} job 
 * @param {object} evaluation 
 * @param {number} [minEmailThreshold=80]
 */
function determineDispatchPriority(job, evaluation, minEmailThreshold = 80) {
  const matchScore = evaluation.matchScore || 0;
  const jobAgeHours = job.jobAgeHours !== null ? job.jobAgeHours : 999;
  const isEligible = Boolean(evaluation.isEligible);

  // Ineligible roles are never emailed
  if (!isEligible) {
    return {
      shouldEmail: false,
      priorityLevel: "REJECTED",
      badgeText: "Ineligible",
      badgeColor: "#ef4444",
      reason: evaluation.rejectReason || "Role ineligible"
    };
  }

  // Strict User Rule: Match score MUST be >= 80 to trigger email alerts
  if (matchScore < minEmailThreshold) {
    return {
      shouldEmail: false,
      priorityLevel: "STORE_ONLY",
      badgeText: `Below Threshold (${matchScore}%)`,
      badgeColor: "#64748b",
      reason: `Match score ${matchScore}/100 is below strict threshold of ${minEmailThreshold}%`
    };
  }

  // High Urgency: Fresh (<3h) and High Score (>=80%)
  if (jobAgeHours <= 3.0) {
    return {
      shouldEmail: true,
      priorityLevel: "URGENT",
      badgeText: `🔥 URGENT ALERT (Posted < 3h | ${matchScore}% Match)`,
      badgeColor: "#dc2626",
      emailSubjectPrefix: `🔥 Urgent (${matchScore}% Match)`
    };
  }

  // Top Tier Match (>= 90%)
  if (matchScore >= 90) {
    return {
      shouldEmail: true,
      priorityLevel: "EXCELLENT",
      badgeText: `💎 TOP MATCH (${matchScore}%)`,
      badgeColor: "#16a34a",
      emailSubjectPrefix: `💎 Top Match (${matchScore}%)`
    };
  }

  // Strong Match (80 - 89%)
  return {
    shouldEmail: true,
    priorityLevel: "STRONG",
    badgeText: `✨ Strong Match (${matchScore}%)`,
    badgeColor: "#2563eb",
    emailSubjectPrefix: `✨ High Match (${matchScore}%)`
  };
}

module.exports = {
  calculateOpportunityScore,
  determineDispatchPriority,
  getSourceTrustScore,
  SOURCE_TRUST_SCORES
};
