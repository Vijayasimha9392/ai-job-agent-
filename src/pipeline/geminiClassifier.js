// =====================================================================
// Gemini AI Job Classifier - Evaluates role suitability via Gemini Flash
// =====================================================================

const candidateProfile = require("../config/candidateProfile");
const config = require("../config/env");

const GEMINI_SYSTEM_PROMPT = `You are an expert technical recruiter and software-engineering job matching AI specifically evaluating opportunities for Vijayasimha Tammineni.

CANDIDATE RESUME PROFILE:
- Name: Vijayasimha Tammineni
- Target Title: Java Full Stack Developer / Software Engineer (0-2 years)
- Education: Bachelor of Technology in Computer Science and Engineering (September 2021 – May 2025, Malla Reddy University, Hyderabad)
- Experience: 8 months professional experience as Trainee Developer at Virinchi Ltd (September 2025 – May 2026, Project: V23 – Healthcare Platform)
- Primary Tech Stack:
  * Backend: Java, Core Java, Spring Boot, Spring MVC, REST APIs, JPA, JDBC, Microservices concepts
  * Frontend: React.js, JavaScript, HTML5, CSS3
  * Database: MySQL, SQL (query optimization & indexing)
  * Tools & Methodologies: Git, GitHub, Maven, Postman, Eclipse, VS Code, Agile, Scrum, SDLC
- Incompatible Frameworks: Angular, Vue.js, Django, Flask, ASP.NET, .NET, PHP (Reject or score low if mandatory).

CRITICAL EVALUATION & SCORING RULES:
1. MATCH SCORE THRESHOLD (>80):
   - Only give a matchScore >= 80 if the role strongly aligns with Java + Spring Boot + React.js / Backend REST APIs / MySQL for early career developers.
   - If a role is predominantly Angular, Python, PHP, C#/.NET, or Mobile (iOS/Android), score it <= 60 or mark isEligible: false.

2. DEEP EXPERIENCE ANALYSIS (0-2 Years / 2025 Grad):
   - The candidate has 8 months of experience.
   - If the job explicitly requires 3+ years mandatory experience (e.g. "3-5 years", "min 3 years", "4+ years"), set isEligible: false, candidateExperienceSuitable: false, and rejectReason: "Requires 3+ years experience (candidate has 0-2 yrs)".
   - If the job requires Senior / Lead / Architect / SDE-2 responsibilities, set isEligible: false.
   - Mark candidateExperienceSuitable: true for Fresher, Junior, Trainee, Associate Software Engineer, Software Engineer 1, or 0-2 years roles.

3. EXPIRED JOB CHECK:
   - If the listing says "application closed", "position filled", "job expired", set isEligible: false, rejectReason: "Job posting has expired or closed".

4. OUTPUT SCHEMA:
   - Return strictly valid JSON matching the requested schema. No markdown formatting, no text outside JSON.`;

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

async function classifyJobWithGemini(job, retryCount = 2) {
  const apiKey = (config.geminiApiKey || "").trim();
  const model = config.geminiModel || "gemini-3.6-flash";

  const fullText = `${job.title} ${job.description}`.toLowerCase();
  const hasCoreTech = fullText.includes("java") || fullText.includes("spring") || fullText.includes("react");

  // If role doesn't have core keywords, evaluate with fast deterministic heuristic in 0ms
  if (!hasCoreTech || !apiKey || apiKey === "your_gemini_api_key_here") {
    return generateFallbackEvaluation(job);
  }

  // Pacing delay for genuine candidates
  await sleep(1500);

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
  const hasSpringBoot = fullText.includes("spring boot") || fullText.includes("spring");
  const hasReact = fullText.includes("react");
  const hasIncompatible = ["angular", "vue", "django", "flask", ".net", "c#", "php"].some(f => fullText.includes(f));

  let isEligible = hasJava || hasSpringBoot;
  let matchScore = Math.min(95, Math.max(20, Math.round((skillPoints / 65) * 85 + (job.freshnessScore || 80) * 0.15)));

  if (hasIncompatible && !hasReact) {
    matchScore = Math.min(60, matchScore);
  }

  // Only assign >80 if both Java and Spring Boot/React/REST APIs are strongly aligned
  if (!hasJava || (!hasSpringBoot && !hasReact)) {
    matchScore = Math.min(72, matchScore);
  }

  let matchLevel = "Weak Match";
  if (matchScore >= 85) matchLevel = "Excellent Match";
  else if (matchScore >= 75) matchLevel = "Strong Match";
  else if (matchScore >= 65) matchLevel = "Good Match";
  else if (matchScore >= 55) matchLevel = "Possible Match";

  return {
    isEligible,
    rejectReason: isEligible ? null : "Lacks required Java/Spring Boot orientation",
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
