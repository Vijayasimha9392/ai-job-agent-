// =====================================================================
// Job Data Normalizer - Converts disparate raw sources into canonical schema
// =====================================================================

const crypto = require("crypto");

/**
 * Strips HTML tags and excessive whitespace
 */
function cleanText(htmlOrText) {
  if (!htmlOrText || typeof htmlOrText !== "string") return "";
  return htmlOrText
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Attempts to extract experience range (e.g. "0-2 years", "1 to 3 yrs", "Fresher")
 */
function extractExperience(text) {
  if (!text) return { min: null, max: null };
  const lower = text.toLowerCase();

  if (lower.includes("fresher") || lower.includes("graduate trainee") || lower.includes("entry level")) {
    return { min: 0, max: 1 };
  }

  const rangeMatch = lower.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)/i);
  if (rangeMatch) {
    return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };
  }

  const singleMatch = lower.match(/(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?experience/i);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1]);
    return { min: val, max: val + 2 };
  }

  return { min: null, max: null };
}

/**
 * Extracts recognized technical keywords from description
 */
function extractCommonSkills(text) {
  if (!text) return [];
  const known = [
    "Java", "Core Java", "Java 17", "Java 8", "Spring Boot", "Spring MVC", "Spring",
    "Hibernate", "JPA", "JDBC", "REST API", "RESTful", "Microservices", "MySQL",
    "PostgreSQL", "SQL", "MongoDB", "React", "React.js", "JavaScript", "TypeScript",
    "Node.js", "Express", "HTML", "CSS", "Tailwind", "Bootstrap", "Git", "GitHub",
    "Maven", "Docker", "AWS", "CI/CD", "JUnit", "Kafka", "Redis"
  ];
  const found = new Set();
  const lower = text.toLowerCase();

  for (const skill of known) {
    const pattern = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(lower)) {
      found.add(skill);
    }
  }
  return Array.from(found);
}

/**
 * Canonical Normalization Function
 */
function normalizeJob(rawJob, sourceName = "Custom") {
  const discoveredAt = new Date().toISOString();

  // Extract basic fields
  const company = cleanText(rawJob.company || rawJob.employer_name || rawJob.company_name || rawJob.hiring_company || "Confidential");
  const title = cleanText(rawJob.title || rawJob.job_title || rawJob.role || "Software Developer");
  const location = cleanText(rawJob.location || rawJob.job_city || rawJob.candidate_required_location || (rawJob.job_country ? `${rawJob.job_city || ""}, ${rawJob.job_country}` : "India") || "India");
  const description = cleanText(rawJob.description || rawJob.job_description || rawJob.snippet || "");
  const applicationUrl = rawJob.applicationUrl || rawJob.job_apply_link || rawJob.apply_url || rawJob.url || rawJob.redirect_url || "";
  const companyCareersUrl = rawJob.companyCareersUrl || rawJob.employer_website || rawJob.company_url || "";
  const salary = cleanText(rawJob.salary || rawJob.job_salary || (rawJob.salary_min ? `₹${rawJob.salary_min} - ₹${rawJob.salary_max}` : "") || "Not Disclosed");
  const jobReferenceId = String(rawJob.jobReferenceId || rawJob.job_id || rawJob.id || rawJob.slug || "").trim();

  // Block synthetic or test data in production execution
  const rawId = String(rawJob.jobId || jobReferenceId || "").toLowerCase();
  if (
    rawId.startsWith("test_") ||
    rawId.startsWith("mock_") ||
    rawId.startsWith("demo_") ||
    rawId.startsWith("fixture_") ||
    rawId.startsWith("synthetic_")
  ) {
    if (process.env.ALLOW_TEST_JOBS !== "true") {
      console.warn(`🛑 [TEST_DATA_BLOCKED] Blocked synthetic/mock job ID: "${rawId}"`);
      return null;
    }
  }

  // Determine work mode
  let workMode = "On-site";
  const fullText = `${title} ${description} ${location}`.toLowerCase();
  if (fullText.includes("remote") || rawJob.is_remote || rawJob.job_is_remote) {
    workMode = "Remote";
  } else if (fullText.includes("hybrid")) {
    workMode = "Hybrid";
  }

  // Parse Published Date (Do not invent timestamps if source does not provide)
  let publishedAt = null;
  let freshnessVerified = false;
  const rawDate = rawJob.publishedAt || rawJob.job_posted_at_datetime_utc || rawJob.created_at || rawJob.publication_date || rawJob.posted_date || rawJob.date;

  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      publishedAt = parsed.toISOString();
      freshnessVerified = true;
    }
  }

  // Experience
  const exp = extractExperience(`${title} ${description}`);
  const minExperience = rawJob.minimumExperience !== undefined && rawJob.minimumExperience !== null ? rawJob.minimumExperience : exp.min;
  const maxExperience = rawJob.maximumExperience !== undefined && rawJob.maximumExperience !== null ? rawJob.maximumExperience : exp.max;

  // Skills
  const rawSkills = Array.isArray(rawJob.skills) ? rawJob.skills : (Array.isArray(rawJob.tags) ? rawJob.tags : []);
  const extractedSkills = extractCommonSkills(description);
  const skills = Array.from(new Set([...rawSkills, ...extractedSkills]));

  // Generate deterministic Job ID
  const hashSeed = `${company}|${title}|${jobReferenceId || applicationUrl}`;
  const jobId = rawJob.jobId || "job_" + crypto.createHash("sha256").update(hashSeed).digest("hex").substring(0, 16);

  // Raw source hash for provenance
  const rawSourceHash = crypto.createHash("sha256").update(JSON.stringify(rawJob)).digest("hex");

  return {
    jobId,
    source: sourceName,
    sourceType: rawJob.sourceType || (sourceName.includes("Greenhouse") || sourceName.includes("Lever") || sourceName.includes("Ashby") || sourceName.includes("Workday") || sourceName.includes("SmartRecruiters") ? "Official ATS" : (sourceName.includes("Adzuna") || sourceName.includes("JSearch") ? "Major Job API" : "Career Feed")),
    sourceJobId: jobReferenceId || "",
    sourceUrl: companyCareersUrl || "",
    company,
    title,
    location,
    workMode,
    employmentType: rawJob.employmentType || rawJob.job_employment_type || "Full-time",
    description,
    skills,
    minimumExperience: minExperience,
    maximumExperience: maxExperience,
    education: rawJob.education || "B.Tech / B.E. / MCA / Any Graduate",
    publishedAt,
    discoveredAt,
    retrievedAt: discoveredAt,
    jobAgeMinutes: null, // Will be computed programmatically by FreshnessEngine
    jobAgeHours: null,   // Will be computed programmatically by FreshnessEngine
    freshnessVerified,
    applicationUrl,
    companyCareersUrl,
    salary,
    jobReferenceId,
    rawSourceHash,
    sourceVerified: true,
    applicationUrlVerified: false,
    titleVerified: Boolean(title && title.length > 2),
    companyVerified: Boolean(company && company.length > 1 && company !== "Confidential")
  };
}

module.exports = {
  normalizeJob,
  cleanText,
  extractExperience,
  extractCommonSkills
};
