// =====================================================================
// Gemini AI Job Classifier - Evaluates role suitability via Gemini Flash
// =====================================================================

const candidateProfile = require("../config/candidateProfile");
const config = require("../config/env");

const GEMINI_SYSTEM_PROMPT = `You are a strict technical job MATCHER, not a job generator.

ABSOLUTE ANTI-HALLUCINATION & IMMUTABILITY RULES:
1. Analyze ONLY the supplied retrieved job. You must never create, simulate, fabricate, infer, or alter job postings.
2. Never invent or alter company names, job titles, job IDs, URLs, locations, experience requirements, publication timestamps, or job descriptions.
3. If information is absent, return null. Never guess it.
4. Your sole responsibility is to evaluate candidate eligibility, calculate match scores (0-100), extract matching technical skills from the supplied description, and explain why the retrieved job matches the candidate profile.

CANDIDATE RESUME PROFILE:
- Name: Vijayasimha Tammineni
- Target Title: Java Full Stack Developer / Software Engineer (0-2 years / Fresher / Trainee)
- Education: Bachelor of Technology in Computer Science and Engineering (September 2021 – May 2025, Malla Reddy University, Hyderabad)
- Experience: 8 months professional experience as Trainee Developer at Virinchi Ltd (September 2025 – May 2026, Project: V23 – Healthcare Platform)
- Primary Tech Stack:
  * Backend: Java, Core Java, Spring Boot, Spring MVC, REST APIs, JPA, JDBC, Microservices concepts
  * Frontend: React.js, JavaScript, HTML5, CSS3
  * Database: MySQL, SQL (query optimization & indexing)
  * Tools & Methodologies: Git, GitHub, Maven, Postman, Eclipse, VS Code, Agile, Scrum, SDLC
- Incompatible Frameworks: Angular, Vue.js, Django, Flask, ASP.NET, .NET, PHP (Reject or score low if mandatory).

CRITICAL SENIORITY & EXPERIENCE RULES:
1. SENIORITY REJECTION:
   - Reject titles containing: "Consultant Specialist", "Specialist", "Consultant", "AVP", "Vice President", "Lead", "Tech Lead", "Architect", "Principal", "Staff", "Manager", "Director", "Software Engineer 2/3", "SDE 2/3" unless the JD explicitly states it is an entry-level / 0-2 years role.
   - If senior/specialist title detected, set isEligible: false, rejectReason: "Seniority or specialist designation exceeds 0-2 years profile".
2. EXPERIENCE MATCH GRADING:
   - Confirmed 0–1 years / Confirmed 1-2 years / Fresher / Trainee / Graduate: Set experienceCategory: "CONFIRMED_EARLY_CAREER", experienceMatch: 100, candidateExperienceSuitable: true.
   - No YOE Specified / Unknown Experience: Set experienceCategory: "UNCONFIRMED_UNSPECIFIED", experienceMatch: 60, candidateExperienceSuitable: true, and cap matchScore at 72%.
   - Mandatory >=2.5 or 3+ years experience (e.g. "8-12 years", "3+ years"): Set experienceCategory: "EXPERIENCED_INELIGIBLE", isEligible: false, candidateExperienceSuitable: false, matchScore <= 30.
3. OUTPUT:
   - Return strictly valid JSON conforming to the schema.`;

function buildGeminiPrompt(job) {
  return `Please evaluate the following job posting for our candidate:

--- JOB DETAILS ---
Title: ${job.title}
Company: ${job.company}
Location: ${job.location} (Work Mode: ${job.workMode})
Employment Type: ${job.employmentType}
Source: ${job.source}
Published At: ${job.publishedAt || "Unknown"} (Age: ${job.jobAgeHours !== null ? job.jobAgeHours + " hours" : "Unknown"})
Extracted Skills: ${job.skills.join(", ") || "None specified"}
Salary: ${job.salary}
Application URL: ${job.applicationUrl}

Job Description:
${job.description.substring(0, 3500)}

--- REQUIRED OUTPUT JSON SCHEMA ---
{
  "isEligible": true | false,
  "rejectReason": string | null,
  "matchScore": number (0-100),
  "matchLevel": "Excellent Match" | "Strong Match" | "Good Match" | "Possible Match" | "Weak Match",
  "experienceCategory": "CONFIRMED_EARLY_CAREER" | "UNCONFIRMED_UNSPECIFIED" | "EXPERIENCED_INELIGIBLE",
  "roleMatch": number (0-100),
  "skillsMatch": number (0-100),
  "experienceMatch": number (0-100),
  "locationMatch": number (0-100),
  "educationMatch": number (0-100),
  "freshnessScore": number (0-100),
  "matchedSkills": [string],
  "missingSkills": [string],
  "experienceRequired": string,
  "candidateExperienceSuitable": true | false,
  "whyMatched": string,
  "applicationPriority": "Apply Immediately" | "High Priority" | "Normal Priority" | "Low Priority" | "Do Not Apply",
  "confidence": number (0.00-1.00)
}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function classifyJobWithGemini(job, retryCount = 3) {
  const apiKey = (config.geminiApiKey || "").trim();
  const model = config.geminiModel || "gemini-3.6-flash";

  const fullText = `${job.title} ${job.description}`.toLowerCase();
  const hasCoreTech = fullText.includes("java") || fullText.includes("spring") || fullText.includes("react");

  // If role doesn't have core keywords, evaluate with fast deterministic heuristic
  if (!hasCoreTech || !apiKey || apiKey === "your_gemini_api_key_here") {
    return generateFallbackEvaluation(job);
  }

  // Enforce pacing to stay well below 15 RPM free tier limit
  await sleep(4000);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const requestPayload = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildGeminiPrompt(job) }]
      }
    ],
    systemInstruction: {
      parts: [{ text: GEMINI_SYSTEM_PROMPT }]
    },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  let lastError = null;
  const delays = [6000, 12000, 20000];

  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(15000)
      });

      if (response.status === 429) {
        throw new Error("HTTP 429 Rate Limit Exceeded (Too Many Requests)");
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }

      const resData = await response.json();
      const candidate = resData?.candidates?.[0];
      const textResponse = candidate?.content?.parts?.[0]?.text;

      if (!textResponse) {
        throw new Error("Empty response text from Gemini API");
      }

      const parsed = JSON.parse(textResponse);
      validateEvaluationSchema(parsed);
      return parsed;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ [Gemini] Attempt ${attempt + 1}/${retryCount} warning: ${err.message}`);

      if (attempt < retryCount - 1) {
        const delay = delays[attempt] || 10000;
        console.log(`⏳ [Gemini] Backing off for ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  console.warn("⚠️ [Gemini] Retries exhausted. Safe fallback rejection.");
  return generateFallbackEvaluation(job, `Gemini API fallback: ${lastError?.message}`);
}

function validateEvaluationSchema(data) {
  if (typeof data.isEligible !== "boolean") data.isEligible = Boolean(data.isEligible);
  if (typeof data.matchScore !== "number") data.matchScore = parseInt(data.matchScore || 0, 10);
  if (!Array.isArray(data.matchedSkills)) data.matchedSkills = [];
  if (!Array.isArray(data.missingSkills)) data.missingSkills = [];
  if (!data.experienceCategory) {
    data.experienceCategory = data.experienceRequired && (data.experienceRequired.includes("0") || data.experienceRequired.includes("1") || data.experienceRequired.includes("2")) ? "CONFIRMED_EARLY_CAREER" : "UNCONFIRMED_UNSPECIFIED";
  }
  if (!data.matchLevel) {
    if (data.matchScore >= 85) data.matchLevel = "Excellent Match";
    else if (data.matchScore >= 75) data.matchLevel = "Strong Match";
    else if (data.matchScore >= 65) data.matchLevel = "Good Match";
    else if (data.matchScore >= 55) data.matchLevel = "Possible Match";
    else data.matchLevel = "Weak Match";
  }
}

function generateFallbackEvaluation(job, fallbackReason = null) {
  const fullText = `${job.title} ${job.description}`.toLowerCase();
  const matched = [];
  const missing = [];

  let skillPoints = 0;
  for (const [skill, pts] of Object.entries(candidateProfile.skillPoints)) {
    if (fullText.includes(skill)) {
      matched.push(skill);
      skillPoints += pts;
    }
  }

  const hasJava = fullText.includes("java");
  const hasSpringBoot = fullText.includes("spring boot") || fullText.includes("spring");
  const hasReact = fullText.includes("react");
  const hasIncompatible = ["angular", "vue", "django", "flask", ".net", "c#", "php"].some(f => fullText.includes(f));

  // Check if explicitly early career
  const hasExpConfirmed = fullText.includes("fresher") || fullText.includes("0-1") || fullText.includes("0-2") || fullText.includes("trainee") || fullText.includes("graduate");
  const experienceCategory = hasExpConfirmed ? "CONFIRMED_EARLY_CAREER" : "UNCONFIRMED_UNSPECIFIED";

  // If this is a fallback due to an API error/timeout, do NOT qualify unconfirmed experience!
  const isFallbackError = Boolean(fallbackReason);

  let isEligible = (hasJava || hasSpringBoot) && (!isFallbackError || hasExpConfirmed);
  let matchScore = 0;

  if (isFallbackError && !hasExpConfirmed) {
    // Safety clamp: Unconfirmed fallback jobs are scored below notification threshold (50%)
    matchScore = 50;
    isEligible = false;
  } else {
    matchScore = Math.min(90, Math.max(20, Math.round((skillPoints / 65) * 85 + (job.freshnessScore || 80) * 0.15)));
    if (experienceCategory === "UNCONFIRMED_UNSPECIFIED") {
      matchScore = Math.min(60, matchScore);
    }
  }

  if (hasIncompatible && !hasReact) {
    matchScore = Math.min(50, matchScore);
  }

  let matchLevel = "Weak Match";
  if (matchScore >= 85) matchLevel = "Excellent Match";
  else if (matchScore >= 75) matchLevel = "Strong Match";
  else if (matchScore >= 65) matchLevel = "Good Match";
  else if (matchScore >= 55) matchLevel = "Possible Match";

  return {
    isEligible,
    isFallback: true,
    rejectReason: isEligible ? null : (isFallbackError ? `Unverified in fallback: ${fallbackReason}` : "Lacks required Java/Spring Boot confirmation"),
    matchScore,
    matchLevel,
    experienceCategory,
    roleMatch: 70,
    skillsMatch: Math.min(100, skillPoints * 2),
    experienceMatch: experienceCategory === "CONFIRMED_EARLY_CAREER" ? 100 : 50,
    locationMatch: 90,
    educationMatch: 100,
    freshnessScore: job.freshnessScore || 80,
    matchedSkills: matched,
    missingSkills: missing,
    experienceRequired: job.minimumExperience ? `${job.minimumExperience}-${job.maximumExperience || job.minimumExperience + 2} years` : (hasExpConfirmed ? "0-2 years (Early Career)" : "Not specified by source (Unconfirmed)"),
    candidateExperienceSuitable: isEligible,
    whyMatched: `Matched core stack (${matched.slice(0, 4).join(", ")}) aligned with early career development. ${fallbackReason ? `[Note: ${fallbackReason}]` : ""}`,
    applicationPriority: matchScore >= 80 ? "Apply Immediately" : (isEligible ? "Normal Priority" : "Do Not Apply"),
    confidence: isFallbackError ? 0.40 : 0.75
  };
}

module.exports = {
  classifyJobWithGemini,
  buildGeminiPrompt,
  GEMINI_SYSTEM_PROMPT,
  generateFallbackEvaluation
};
