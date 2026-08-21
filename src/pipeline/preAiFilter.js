// =====================================================================
// Pre-AI Rule-Based Filter - Strict software engineering screening
// =====================================================================

const TITLE_DEV_REQUIRED = [
  "software", "developer", "engineer", "java", "spring", "backend", "full stack",
  "fullstack", "programmer", "trainee", "graduate", "sde", "frontend", "web",
  "application", "coding", "associate", "analyst", "member of technical staff",
  "mts", "junior", "fresher"
];

const SENIORITY_BLACKLIST = [
  "senior", "sr.", "sr ", "lead", "principal", "staff engineer", "staff", "architect",
  "engineering manager", "manager", "director", "vp", "head of engineering",
  "tech lead", "technical lead", "solution architect", "enterprise architect",
  "chief technology", "associate director", "group lead", "head of", "executive",
  "software engineer 2", "software engineer ii", "software engineer iii", "software engineer 3",
  "software developer 2", "software developer ii", "software developer iii", "software developer 3",
  "sde 2", "sde ii", "sde iii", "sde-2", "sde-ii", "sde-3", "sde-iii",
  "level 2", "level ii", "level 3", "level iii", "mid-level", "mid level",
  "specialist ii", "specialist 2"
];

const NON_DEV_BLACKLIST = [
  "bpo", "call center", "telecaller", "customer support", "customer service", "voice process",
  "non voice", "sales", "inside sales", "business development", "marketing", "events",
  "hr", "human resources", "talent acquisition", "recruiter", "recruiting", "talent",
  "accountant", "financial analyst", "billing", "buchhaltung", "steuer", "finance", "legal",
  "manual tester", "qa manual", "data entry", "desktop support", "l1 support", "helpdesk",
  "network engineer", "hardware engineer", "system administrator", "labeling", "annotation",
  "mechanical", "civil", "electrical", "site engineer", "field engineer", "servicetechniker",
  "seo specialist", "content writer", "graphic designer", "digital marketing", "media",
  "working student", "werkstudent", "praktikant", "fachassistent", "pflege", "vertrieb"
];

const EXPIRED_KEYWORDS = [
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

const NON_INDIA_LOCATIONS = [
  "germany", "deutschland", "dach", "france", "uk", "united kingdom", "london", "berlin",
  "munich", "frankfurt", "paris", "poland", "romania", "netherlands", "amsterdam",
  "brazil", "mexico", "philippines"
];

/**
 * Evaluates whether a job passes deterministic rule-based checks
 * @param {object} job 
 * @returns {object} { isPass: boolean, reason?: string, filterCategory?: string }
 */
function applyPreAiFilter(job) {
  const title = (job.title || "").toLowerCase();
  const desc = (job.description || "").toLowerCase();
  const location = (job.location || "").toLowerCase();
  const fullText = `${title} ${desc} ${location}`;

  // 1. Expired / Inactive Job Check
  for (const phrase of EXPIRED_KEYWORDS) {
    if (fullText.includes(phrase)) {
      return {
        isPass: false,
        reason: `Expired job indicator found: "${phrase}"`,
        filterCategory: "EXPIRED_JOB"
      };
    }
  }

  // 2. Title MUST contain software engineering / development terms
  const hasDevTitle = TITLE_DEV_REQUIRED.some(term => {
    const regex = new RegExp(`\\b${term.replace(".", "\\.")}\\b`, "i");
    return regex.test(title);
  });

  if (!hasDevTitle) {
    return {
      isPass: false,
      reason: `Title "${job.title}" does not contain software engineering role terms`,
      filterCategory: "NON_DEV_ROLE"
    };
  }

  // 3. Reject Seniority Blacklist in Title
  for (const term of SENIORITY_BLACKLIST) {
    const regex = new RegExp(`\\b${term.replace(".", "\\.")}\\b`, "i");
    if (regex.test(title)) {
      return {
        isPass: false,
        reason: `Seniority / Mid-level keyword detected in title: "${term}"`,
        filterCategory: "SENIORITY"
      };
    }
  }

  // 4. Reject Non-Dev Blacklist in Title
  for (const term of NON_DEV_BLACKLIST) {
    const regex = new RegExp(`\\b${term}\\b`, "i");
    if (regex.test(title)) {
      return {
        isPass: false,
        reason: `Non-software development role detected: "${term}"`,
        filterCategory: "NON_DEV_ROLE"
      };
    }
  }

  // 5. Check Non-India Locations
  const hasIndiaKeyword = location.includes("india") || location.includes("bangalore") || 
                          location.includes("bengaluru") || location.includes("hyderabad") || 
                          location.includes("pune") || location.includes("chennai") || 
                          location.includes("mumbai") || location.includes("delhi") || 
                          location.includes("noida") || location.includes("gurgaon") || 
                          location.includes("gurugram");

  if (!hasIndiaKeyword) {
    for (const nonInd of NON_INDIA_LOCATIONS) {
      if (location.includes(nonInd) || title.includes(nonInd)) {
        return {
          isPass: false,
          reason: `Job is explicitly localized to foreign region: "${job.location}"`,
          filterCategory: "LOCATION_INELIGIBLE"
        };
      }
    }
  }

  // 6. Deep Experience Analysis (Reject 3+ years mandatory experience)
  if (job.minimumExperience !== null && job.minimumExperience >= 3.0) {
    return {
      isPass: false,
      reason: `Mandatory minimum experience (${job.minimumExperience} years) exceeds candidate profile (0-2 years, 2025 B.Tech)`,
      filterCategory: "EXPERIENCE_EXCEEDED"
    };
  }

  // Regex 6A: "minimum 3+ years", "at least 3 years", "requires 4-6 years", "3 to 5 years"
  const expMatch = fullText.match(/(?:minimum|min|requires?|mandatory|at least|with|\b)\s*([3-9]|\d{2})\+?\s*(?:-|to|\+)?\s*\d*\s*(?:years?|yrs?)(?:\s+of\s+experience|\s+experience)?/i);
  if (expMatch) {
    const minYears = parseInt(expMatch[1], 10);
    if (minYears >= 3) {
      return {
        isPass: false,
        reason: `Requires ${minYears}+ years experience (matches "${expMatch[0].trim()}"), exceeding candidate 0-2 yrs profile`,
        filterCategory: "EXPERIENCE_EXCEEDED"
      };
    }
  }

  // Regex 6B: Explicit range "3-5 years", "3 - 7 yrs", "4-6 yrs"
  const rangeMatch = fullText.match(/\b([3-9])\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)/i);
  if (rangeMatch) {
    const startRange = parseInt(rangeMatch[1], 10);
    if (startRange >= 3) {
      return {
        isPass: false,
        reason: `Experience range ${rangeMatch[0]} exceeds early-career (0-2 years) threshold`,
        filterCategory: "EXPERIENCE_EXCEEDED"
      };
    }
  }

  // 7. Must have a valid application URL
  if (!job.applicationUrl || job.applicationUrl.trim().length < 5) {
    return {
      isPass: false,
      reason: "Missing or invalid application URL",
      filterCategory: "INVALID_URL"
    };
  }

  return {
    isPass: true,
    reason: "Passed all pre-AI deterministic filters",
    filterCategory: "PASSED"
  };
}

module.exports = {
  applyPreAiFilter,
  TITLE_DEV_REQUIRED,
  SENIORITY_BLACKLIST,
  NON_DEV_BLACKLIST,
  EXPIRED_KEYWORDS
};
