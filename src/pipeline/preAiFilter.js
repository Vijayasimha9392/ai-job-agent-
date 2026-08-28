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
  "senior", "sr.", "sr ", "sr", "lead", "principal", "staff engineer", "staff", "architect",
  "engineering manager", "manager", "director", "vp", "head of engineering",
  "tech lead", "technical lead", "solution architect", "enterprise architect",
  "chief technology", "associate director", "group lead", "head of", "executive",
  "consultant specialist", "consultant", "specialist", "assistant vice president", "avp",
  "vice president", "software engineer 2", "software engineer ii", "software engineer iii",
  "software engineer 3", "software developer 2", "software developer ii", "software developer iii",
  "software developer 3", "sde 2", "sde ii", "sde iii", "sde-2", "sde-ii", "sde-3", "sde-iii",
  "sde2", "sde3", "level 2", "level ii", "level 3", "level iii", "mid-level", "mid level",
  "specialist ii", "specialist 2", "senior associate"
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

const NON_TARGET_TECH = [
  "c++", "embedded", "cybersecurity", "cyber security", "automotive", "hardware",
  "diagnostic", "firmware", "autocad", "sap", "abap", "salesforce", "mainframe",
  "cobol", "ios developer", "swift", "flutter", "android developer", "react native",
  "ruby", "ruby on rails", "php developer", "laravel", "dotnet", ".net", "c#",
  "golang", "rust developer"
];

const INDIAN_LOCATIONS = [
  "india", "bengaluru", "bangalore", "hyderabad", "pune", "chennai", "mumbai",
  "delhi", "ncr", "noida", "gurgaon", "gurugram", "kolkata", "ahmedabad",
  "kochi", "coimbatore", "chandigarh", "jaipur", "indore", "trivandrum",
  "thiruvananthapuram", "mysore", "mysuru", "mohali", "bhubaneswar",
  "secunderabad", "karnataka", "telangana", "maharashtra", "tamil nadu",
  "kerala", "haryana", "uttar pradesh"
];

const FOREIGN_LOCATIONS = [
  "united states", "usa", "us", "united kingdom", "uk", "london", "germany",
  "deutschland", "berlin", "munich", "frankfurt", "france", "paris", "canada",
  "toronto", "vancouver", "australia", "sydney", "melbourne", "singapore",
  "netherlands", "amsterdam", "poland", "warsaw", "krakow", "sweden",
  "stockholm", "switzerland", "zurich", "dubai", "uae", "brazil", "mexico",
  "philippines", "japan", "tokyo", "ireland", "dublin", "austin", "san francisco",
  "seattle", "new york", "california", "texas", "chicago", "boston", "los angeles",
  "emea", "latam", "apac", "romania", "hungary", "spain", "madrid", "italy", "rome"
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

  // Normalized title for clean word boundary checks
  const normTitle = title.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

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
    const regex = new RegExp(`\\b${term}\\b`, "i");
    return regex.test(normTitle);
  });

  if (!hasDevTitle) {
    return {
      isPass: false,
      reason: `Title "${job.title}" does not contain software engineering role terms`,
      filterCategory: "NON_DEV_ROLE"
    };
  }

  // 3. Reject Seniority Blacklist in Title (with punctuation-clean matching)
  for (const term of SENIORITY_BLACKLIST) {
    const regex = new RegExp(`\\b${term.replace(".", "\\.")}\\b`, "i");
    if (regex.test(normTitle)) {
      return {
        isPass: false,
        reason: `Seniority / Leadership keyword detected in title: "${term}"`,
        filterCategory: "SENIORITY"
      };
    }
  }

  // 4. Reject Non-Dev Blacklist in Title
  for (const term of NON_DEV_BLACKLIST) {
    const regex = new RegExp(`\\b${term}\\b`, "i");
    if (regex.test(normTitle)) {
      return {
        isPass: false,
        reason: `Non-software development role detected: "${term}"`,
        filterCategory: "NON_DEV_ROLE"
      };
    }
  }

  // 5. Reject completely non-target hardware / embedded / C++ tech titles
  for (const tech of NON_TARGET_TECH) {
    const regex = new RegExp(`\\b${tech.replace("+", "\\+").replace("#", "\\#")}\\b`, "i");
    if (regex.test(normTitle)) {
      return {
        isPass: false,
        reason: `Non-target technology stack in title: "${tech}"`,
        filterCategory: "NON_TARGET_TECH"
      };
    }
  }

  // 6. Strict India Location Verification (Candidate is based in Hyderabad / India)
  const locLower = (job.location || "").toLowerCase();
  const titleLower = (job.title || "").toLowerCase();
  const descLower = (job.description || "").toLowerCase();

  const isIndiaExplicit = INDIAN_LOCATIONS.some(ind => {
    const reg = new RegExp(`\\b${ind}\\b`, "i");
    return reg.test(locLower) || reg.test(titleLower);
  });

  const hasForeignExplicit = FOREIGN_LOCATIONS.some(foreign => {
    const reg = new RegExp(`\\b${foreign}\\b`, "i");
    return reg.test(locLower);
  });

  // If explicitly in a foreign location and NOT in India -> REJECT
  if (hasForeignExplicit && !isIndiaExplicit) {
    return {
      isPass: false,
      reason: `Job location "${job.location}" is outside India (matches foreign region)`,
      filterCategory: "LOCATION_INELIGIBLE"
    };
  }

  // If location is NOT confirmed in India -> REJECT
  if (!isIndiaExplicit) {
    const descHasIndia = INDIAN_LOCATIONS.some(ind => new RegExp(`\\b${ind}\\b`, "i").test(descLower.slice(0, 400)));
    if (!descHasIndia) {
      return {
        isPass: false,
        reason: `Job location "${job.location}" is not verified within India or Indian tech hubs`,
        filterCategory: "LOCATION_INELIGIBLE"
      };
    }
  }

  // 7. Deep Experience Analysis (Reject >= 2.5 or 3+ years mandatory experience)
  if (job.minimumExperience !== null && job.minimumExperience >= 2.5) {
    return {
      isPass: false,
      reason: `Mandatory minimum experience (${job.minimumExperience} years) exceeds candidate profile (0-2 years, 2025 B.Tech)`,
      filterCategory: "EXPERIENCE_EXCEEDED"
    };
  }

  // Regex 7A: Decimal or integer years: "8.00-12.00 Years", "3+ years", "3.5 yrs", "experience: 8.00 - 12.00"
  const highExpRegex = /(?:experience|exp|requires?|mandatory|at least|with|\b)\s*:?\s*([3-9]|\d{2})(?:\.\d+)?\s*(?:\+|plus)?\s*(?:-|to|\+)?\s*\d*(?:\.\d+)?\s*(?:years?|yrs?)/i;
  const expMatch = fullText.match(highExpRegex);
  if (expMatch) {
    const num = parseFloat(expMatch[1]);
    if (num >= 3.0) {
      return {
        isPass: false,
        reason: `Requires ${num}+ years experience (matches "${expMatch[0].trim()}"), exceeding candidate 0-2 yrs profile`,
        filterCategory: "EXPERIENCE_EXCEEDED"
      };
    }
  }

  // Regex 7B: Decimal range like "2.5 - 5 years" or "2.5+ years"
  const decimalHighRegex = /\b([2-9]\.[1-9]|\d{2}\.\d+)\s*(?:\+|plus)?\s*(?:-|to|\+)?\s*\d*(?:\.\d+)?\s*(?:years?|yrs?)/i;
  const decMatch = fullText.match(decimalHighRegex);
  if (decMatch) {
    return {
      isPass: false,
      reason: `Experience requirement ${decMatch[0]} exceeds early-career (0-2 years) threshold`,
      filterCategory: "EXPERIENCE_EXCEEDED"
    };
  }

  // Regex 7C: Explicit range starting at 3+: "3-5 years", "4 - 7 yrs", "8.00-12.00 Years"
  const rangeMatch = fullText.match(/\b([3-9]|\d{2})(?:\.\d+)?\s*(?:-|to)\s*\d+(?:\.\d+)?\s*(?:years?|yrs?)/i);
  if (rangeMatch) {
    return {
      isPass: false,
      reason: `Experience range ${rangeMatch[0]} exceeds early-career (0-2 years) threshold`,
      filterCategory: "EXPERIENCE_EXCEEDED"
    };
  }

  // 8. Must have a valid application URL
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
