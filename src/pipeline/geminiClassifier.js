// =====================================================================
// Gemini AI Job Classifier - Evaluates role suitability via Gemini Flash
// =====================================================================

const candidateProfile = require("../config/candidateProfile");
const config = require("../config/env");

const GEMINI_SYSTEM_PROMPT = `You are an expert technical recruiter and software-engineering job matching AI specializing in early-career talent in India.

Your responsibility is to deeply analyze job descriptions and determine whether a job is genuinely suitable for our specific candidate.

Candidate Profile:
- Skills: Java, Core Java, Java 17, Spring Boot, Spring MVC, REST APIs, MySQL, SQL, React.js, JavaScript, HTML, CSS, Git, Maven, JPA, JDBC, Hibernate concepts, Microservices basics.
- Experience Level: Early career (~8–12 months / 0–2 years range).
- Education: B.Tech in Computer Science & Engineering, 2025 Graduate.
- Target Roles: Fresher, Junior Developer, Associate Software Engineer, Trainee, Graduate Engineer, Software Engineer I, SDE 1 (0–2 years).

CRITICAL EVALUATION RULES:
1. DEEP EXPERIENCE ANALYSIS:
   - Carefully inspect the experience required in the job description.
   - If a job demands 3+ years of mandatory experience (e.g. "3-5 years", "minimum 3 years", "at least 4 years", "5+ years"), you MUST set "isEligible": false, "candidateExperienceSuitable": false, and "rejectReason": "Requires 3+ years experience which exceeds candidate profile (0-2 years)".
   - If a job requires Senior / Lead / Principal / Architect / SDE-2 / Team Lead responsibilities, you MUST set "isEligible": false.
   - Jobs suitable for 2024/2025 Graduates, Freshers, 0-1 year, 0-2 years, Junior, or Entry Level roles must be marked "candidateExperienceSuitable": true and "isEligible": true.

2. EXPIRED / CLOSED JOB DETECTION:
   - If the description mentions "application closed", "position filled", "job expired", or "no longer accepting applications", set "isEligible": false, "rejectReason": "Job posting has expired or closed".

3. TECHNICAL STACK ALIGNMENT:
   - High score (>=80%) requires core Java, Spring Boot, or Full Stack / Backend engineering alignment.
   - Do not reject a strong fresher opportunity if it lacks React when Java/Spring Boot/SQL are present.
   - Reject Non-Dev roles (BPO, Sales, Support, HR, Manual Testing).

4. OUTPUT REQUIREMENTS:
   - Return strictly valid JSON conforming to the requested schema. No markdown formatting, no commentary outside JSON.`;

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

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return generateFallbackEvaluation(job);
  }

  // Pacing delay to remain strictly within free-tier Rate Limits
  await sleep(3500);

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
  const delays = [8000, 20000, 40000];

  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(25000)
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

  console.warn("⚠️ [Gemini] Retries exhausted. Utilizing robust local heuristic evaluation.");
  return generateFallbackEvaluation(job, `Gemini API fallback: ${lastError?.message}`);
}

function validateEvaluationSchema(data) {
  if (typeof data.isEligible !== "boolean") data.isEligible = Boolean(data.isEligible);
  if (typeof data.matchScore !== "number") data.matchScore = parseInt(data.matchScore || 0, 10);
  if (!Array.isArray(data.matchedSkills)) data.matchedSkills = [];
  if (!Array.isArray(data.missingSkills)) data.missingSkills = [];
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
  const hasBackend = fullText.includes("backend") || fullText.includes("api") || fullText.includes("full stack") || fullText.includes("software");

  let isEligible = hasJava || hasBackend;
  let matchScore = Math.min(95, Math.max(30, Math.round((skillPoints / 60) * 80 + (job.freshnessScore || 80) * 0.2)));

  let matchLevel = "Weak Match";
  if (matchScore >= 85) matchLevel = "Excellent Match";
  else if (matchScore >= 75) matchLevel = "Strong Match";
  else if (matchScore >= 65) matchLevel = "Good Match";
  else if (matchScore >= 55) matchLevel = "Possible Match";

  return {
    isEligible,
    rejectReason: isEligible ? null : "Lacks required Java/Backend orientation",
    matchScore,
    matchLevel,
    roleMatch: 80,
    skillsMatch: Math.min(100, skillPoints * 2),
    experienceMatch: 85,
    locationMatch: 90,
    educationMatch: 100,
    freshnessScore: job.freshnessScore || 80,
    matchedSkills: matched,
    missingSkills: missing,
    experienceRequired: job.minimumExperience ? `${job.minimumExperience}-${job.maximumExperience || job.minimumExperience + 2} years` : "0-2 years",
    candidateExperienceSuitable: true,
    whyMatched: `Matched core stack (${matched.slice(0, 4).join(", ")}) aligned with early career development. ${fallbackReason ? `[Note: ${fallbackReason}]` : ""}`,
    applicationPriority: matchScore >= 80 ? "Apply Immediately" : "Normal Priority",
    confidence: 0.85
  };
}

module.exports = {
  classifyJobWithGemini,
  buildGeminiPrompt,
  GEMINI_SYSTEM_PROMPT,
  generateFallbackEvaluation
};
