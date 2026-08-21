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
 * @param {object} job 
 * @param {object} evaluation 
 * @param {number} minEmailThreshold
 */
function determineDispatchPriority(job, evaluation, minEmailThreshold = 65) {
  const matchScore = evaluation.matchScore || 0;
  const jobAgeHours = job.jobAgeHours !== null ? job.jobAgeHours : 999;
  const isEligible = evaluation.isEligible;

  if (!isEligible) {
    return {
      shouldEmail: false,
      priorityLevel: "REJECTED",
      badgeText: "Ineligible",
      badgeColor: "#ef4444",
      reason: evaluation.rejectReason || "Role ineligible"
    };
  }

  // 1. Check URGENT conditions
  if (jobAgeHours <= 3.0 && matchScore >= 75) {
    return {
      shouldEmail: true,
      priorityLevel: "URGENT",
      badgeText: "🔥 URGENT ALERT (Posted < 3h)",
      badgeColor: "#dc2626",
      emailSubjectPrefix: "🔥 Apply Now (Posted < 3h)"
    };
  }

  // 2. Check HIGH PRIORITY conditions
  if (jobAgeHours <= 6.0 && matchScore >= 85) {
    return {
      shouldEmail: true,
      priorityLevel: "HIGH_PRIORITY",
      badgeText: "⚡ HIGH PRIORITY (< 6h)",
      badgeColor: "#ea580c",
      emailSubjectPrefix: "⚡ High Priority Match"
    };
  }

  // 3. Excellent / Strong / Good Matches
  if (matchScore >= minEmailThreshold) {
    return {
      shouldEmail: true,
      priorityLevel: matchScore >= 85 ? "EXCELLENT" : (matchScore >= 75 ? "STRONG" : "GOOD"),
      badgeText: `✨ ${evaluation.matchLevel} (${matchScore}%)`,
      badgeColor: matchScore >= 85 ? "#16a34a" : "#2563eb",
      emailSubjectPrefix: "🚨 New Job Match"
    };
  }

  // 4. Possible Match condition (55-64) - Only email if extremely fresh (<2h) & strong role match
  if (matchScore >= 55 && jobAgeHours <= 2.0 && (evaluation.roleMatch || 0) >= 80) {
    return {
      shouldEmail: true,
      priorityLevel: "POSSIBLE_FRESH",
      badgeText: "⏱️ Fresh Opportunity (55-64%)",
      badgeColor: "#d97706",
      emailSubjectPrefix: "⏱️ Fresh Match"
    };
  }

  // Otherwise, store without email
  return {
    shouldEmail: false,
    priorityLevel: "STORE_ONLY",
    badgeText: "Stored (Below Email Threshold)",
    badgeColor: "#64748b",
    reason: `Match score ${matchScore} is below threshold ${minEmailThreshold}`
  };
}

module.exports = {
  calculateOpportunityScore,
  determineDispatchPriority,
  getSourceTrustScore,
  SOURCE_TRUST_SCORES
};
