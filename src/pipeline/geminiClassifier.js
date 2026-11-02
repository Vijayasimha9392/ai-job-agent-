// =====================================================================
// Gemini AI Job Classifier
// Strict job matching for early-career Java Full Stack Developer roles
// =====================================================================

const candidateProfile = require("../config/candidateProfile");
const config = require("../config/env");

const GEMINI_SYSTEM_PROMPT = `
You are a strict technical job matcher.

Your responsibility is to evaluate ONLY the supplied real job posting.
Never invent job details, requirements, company information, URLs,
salary information, experience requirements, or publication dates.

CANDIDATE PROFILE:
- B.Tech Computer Science Engineering graduate, 2025
- Approximately 8 months professional experience
- Trainee Developer at Virinchi Ltd
- Java, Core Java, Spring Boot, Spring MVC, REST APIs
- React.js, JavaScript, HTML, CSS
- MySQL, SQL, JDBC, JPA
- Git, GitHub, Maven, Postman
- Agile, Scrum, SDLC

TARGET ROLES:
- Java Developer
- Java Backend Developer
- Java Full Stack Developer
- Software Engineer
- Associate Software Engineer
- SDE-1
- Spring Boot Developer
- Junior Backend Developer

TARGET EXPERIENCE:
- Fresher
- Graduate
- Trainee
- 0-1 years
- 0-2 years
- 1-2 years

STRICT REJECTION RULES:
1. Reject senior, lead, principal, architect, manager, director,
   specialist, consultant, AVP, VP, SDE-2, SDE-3, and Engineer-2/3
   positions unless the job clearly states it is an entry-level role.
2. Reject jobs explicitly requiring 3 or more years of experience.
3. Do not assume a job is suitable just because it mentions Java.
4. Do not assume missing experience requirements are entry-level.
5. If experience is not specified, mark it as UNCONFIRMED_UNSPECIFIED.
6. If the job requires unrelated mandatory technologies, score it lower
   or reject it.
7. Never fabricate matched skills.
8. Evaluate the job description conservatively.
9. Return valid JSON only.
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeString(value, fallback = "Not specified") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}

function buildGeminiPrompt(job = {}) {
  const skills = Array.isArray(job.skills)
    ? job.skills.join(", ")
    : safeString(job.skills, "None specified");

  const description = safeString(job.description, "")
    .substring(0, 5000);

  return `
Evaluate the following retrieved job posting for the candidate.

JOB DETAILS:
Title: ${safeString(job.title)}
Company: ${safeString(job.company)}
Location: ${safeString(job.location)}
Work Mode: ${safeString(job.workMode)}
Employment Type: ${safeString(job.employmentType)}
Source: ${safeString(job.source)}
Published At: ${safeString(job.publishedAt)}
Job Age Hours: ${safeString(job.jobAgeHours)}
Skills: ${skills}
Salary: ${safeString(job.salary)}
Application URL: ${safeString(job.applicationUrl)}

JOB DESCRIPTION:
${description}

Return a JSON object with these fields:

{
  "isEligible": boolean,
  "rejectReason": string or null,
  "matchScore": number,
  "matchLevel": string,
  "experienceCategory": string,
  "roleMatch": number,
  "skillsMatch": number,
  "experienceMatch": number,
  "locationMatch": number,
  "educationMatch": number,
  "freshnessScore": number,
  "matchedSkills": string[],
  "missingSkills": string[],
  "experienceRequired": string,
  "candidateExperienceSuitable": boolean,
  "whyMatched": string,
  "applicationPriority": string,
  "confidence": number
}

Allowed experienceCategory values:
- CONFIRMED_EARLY_CAREER
- UNCONFIRMED_UNSPECIFIED
- EXPERIENCED_INELIGIBLE

Score values must be between 0 and 100.

confidence must be between 0 and 1.

Do not include Markdown or code fences.
`;
}

function clampNumber(value, min = 0, max = 100) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.max(min, Math.min(max, number));
}

function getMatchLevel(score) {
  if (score >= 85) return "Excellent Match";
  if (score >= 75) return "Strong Match";
  if (score >= 65) return "Good Match";
  if (score >= 55) return "Possible Match";

  return "Weak Match";
}

function validateEvaluationSchema(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Gemini returned an invalid JSON object.");
  }

  if (typeof data.isEligible !== "boolean") {
    throw new Error("Gemini response missing valid isEligible field.");
  }

  if (typeof data.candidateExperienceSuitable !== "boolean") {
    throw new Error(
      "Gemini response missing valid candidateExperienceSuitable field."
    );
  }

  if (!Number.isFinite(Number(data.matchScore))) {
    throw new Error("Gemini response missing valid matchScore.");
  }

  data.matchScore = clampNumber(data.matchScore);

  const scoreFields = [
    "roleMatch",
    "skillsMatch",
    "experienceMatch",
    "locationMatch",
    "educationMatch",
    "freshnessScore"
  ];

  for (const field of scoreFields) {
    data[field] = clampNumber(data[field]);
  }

  data.confidence = clampNumber(data.confidence, 0, 1);

  if (!Array.isArray(data.matchedSkills)) {
    data.matchedSkills = [];
  }

  if (!Array.isArray(data.missingSkills)) {
    data.missingSkills = [];
  }

  data.matchedSkills = data.matchedSkills
    .filter((skill) => typeof skill === "string")
    .slice(0, 30);

  data.missingSkills = data.missingSkills
    .filter((skill) => typeof skill === "string")
    .slice(0, 30);

  data.rejectReason =
    typeof data.rejectReason === "string"
      ? data.rejectReason
      : null;

  data.experienceRequired =
    safeString(data.experienceRequired, "Not specified");

  data.experienceCategory =
    safeString(data.experienceCategory, "UNCONFIRMED_UNSPECIFIED");

  data.matchLevel = getMatchLevel(data.matchScore);

  data.whyMatched =
    safeString(data.whyMatched, "No detailed explanation provided.");

  data.applicationPriority =
    safeString(data.applicationPriority, "Normal Priority");

  // Safety: score alone must not override Gemini's eligibility decision.
  if (!data.isEligible || !data.candidateExperienceSuitable) {
    data.isEligible = false;
  }

  return data;
}

function generateFailureEvaluation(reason = "Gemini evaluation unavailable.") {
  return {
    isEligible: false,
    isFallback: true,
    evaluationStatus: "GEMINI_FAILED",
    rejectReason: reason,
    matchScore: 0,
    matchLevel: "Not Evaluated",
    experienceCategory: "UNCONFIRMED_UNSPECIFIED",
    roleMatch: 0,
    skillsMatch: 0,
    experienceMatch: 0,
    locationMatch: 0,
    educationMatch: 0,
    freshnessScore: 0,
    matchedSkills: [],
    missingSkills: [],
    experienceRequired: "Not evaluated",
    candidateExperienceSuitable: false,
    whyMatched:
      "Gemini evaluation was unsuccessful. Manual review is required. Automatic notification is blocked.",
    applicationPriority: "Do Not Apply",
    confidence: 0
  };
}

async function classifyJobWithGemini(job, retryCount = 3) {
  const apiKey = String(config.geminiApiKey || "").trim();

  const model = String(
    config.geminiModel || "gemini-3.8-flash"
  ).trim();

  if (!job || typeof job !== "object") {
    return generateFailureEvaluation("Invalid job input.");
  }

  if (
    !apiKey ||
    apiKey === "your_gemini_api_key_here" ||
    apiKey.toLowerCase() === "undefined"
  ) {
    console.warn("[Gemini] API key is missing. Job evaluation blocked.");

    return generateFailureEvaluation(
      "GEMINI_API_KEY is missing or invalid."
    );
  }

  const fullText = `${job.title || ""} ${job.description || ""}`
    .toLowerCase();

  const hasCoreTech =
    fullText.includes("java") ||
    fullText.includes("spring") ||
    fullText.includes("react");

  if (!hasCoreTech) {
    return {
      ...generateFailureEvaluation(
        "Job does not contain relevant Java, Spring, or React keywords."
      ),
      evaluationStatus: "RULE_REJECTED",
      isFallback: false
    };
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestPayload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildGeminiPrompt(job)
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        {
          text: GEMINI_SYSTEM_PROMPT
        }
      ]
    },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const safeRetryCount = Math.max(
    1,
    Math.min(Number(retryCount) || 3, 5)
  );

  const retryDelays = [5000, 10000, 20000, 30000];

  let lastError = null;

  for (let attempt = 0; attempt < safeRetryCount; attempt++) {
    try {
      // Conservative request pacing.
      if (attempt === 0) {
        await sleep(1500);
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(30000)
      });

      if (response.status === 429) {
        throw new Error("Gemini rate limit exceeded (HTTP 429).");
      }

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Gemini API HTTP ${response.status}: ${errorText.slice(0, 300)}`
        );
      }

      const responseData = await response.json();

      const responseText =
        responseData?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("");

      if (!responseText) {
        throw new Error("Gemini returned an empty response.");
      }

      let parsed;

      try {
        parsed = JSON.parse(responseText);
      } catch {
        throw new Error("Gemini response was not valid JSON.");
      }

      const evaluation = validateEvaluationSchema(parsed);

      return {
        ...evaluation,
        isFallback: false,
        evaluationStatus: "GEMINI_EVALUATED"
      };
    } catch (error) {
      lastError = error;

      console.warn(
        `[Gemini] Attempt ${attempt + 1}/${safeRetryCount} failed: ${error.message}`
      );

      if (attempt < safeRetryCount - 1) {
        const delay =
          retryDelays[attempt] || retryDelays[retryDelays.length - 1];

        await sleep(delay);
      }
    }
  }

  console.error(
    "[Gemini] All retries failed. Automatic job notification is blocked."
  );

  return generateFailureEvaluation(
    lastError?.message || "Gemini API failed after retries."
  );
}

function generateFallbackEvaluation(job, fallbackReason = null) {
  // Retained for compatibility with existing project imports.
  // It must never qualify a job for automatic notification.
  const fullText = `${job?.title || ""} ${job?.description || ""}`
    .toLowerCase();

  const matchedSkills = [];

  const skillPoints = candidateProfile?.skillPoints || {};

  for (const skill of Object.keys(skillPoints)) {
    if (fullText.includes(skill.toLowerCase())) {
      matchedSkills.push(skill);
    }
  }

  return {
    ...generateFailureEvaluation(
      fallbackReason || "Heuristic fallback is not an approved evaluation."
    ),
    matchedSkills,
    evaluationStatus: "FALLBACK_MANUAL_REVIEW",
    isFallback: true,
    whyMatched:
      "Heuristic evaluation is provided for reference only. It cannot authorize automatic notification."
  };
}

module.exports = {
  classifyJobWithGemini,
  buildGeminiPrompt,
  GEMINI_SYSTEM_PROMPT,
  generateFallbackEvaluation,
  validateEvaluationSchema
};
