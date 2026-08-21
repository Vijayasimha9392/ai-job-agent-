// =====================================================================
// Environment Variables Loader & Config Validator (Zero Dependency)
// =====================================================================

const path = require("path");
const fs = require("fs");

// Minimal zero-dependency .env parser
function loadEnvFile() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const idx = trimmed.indexOf("=");
          if (idx > 0) {
            const key = trimmed.substring(0, idx).trim();
            let val = trimmed.substring(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.substring(1, val.length - 1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch (e) {}
  }
}

loadEnvFile();

const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  candidateName: process.env.CANDIDATE_NAME || "Vijayasimha Tammineni",
  candidateEmail: (process.env.CANDIDATE_EMAIL || "thornay7@gmail.com").trim(),
  minMatchScoreToEmail: parseInt(process.env.MIN_MATCH_SCORE_TO_EMAIL || "80", 10),
  maxJobAgeHours: parseFloat(process.env.MAX_JOB_AGE_HOURS || "24"),
  safetyBufferMinutes: parseInt(process.env.SAFETY_BUFFER_MINUTES || "15", 10),
  timezone: process.env.TIMEZONE || "Asia/Kolkata",
  scheduleIntervalMinutes: parseInt(process.env.SCHEDULE_INTERVAL_MINUTES || "55", 10),
  cronSchedule: process.env.CRON_SCHEDULE || "*/55 * * * *",

  // SMTP Settings
  smtp: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: process.env.SMTP_SECURE !== "false",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Job Hunter AI <noreply@jobhunter.ai>"
  },

  // Database
  database: {
    useSqlite: process.env.USE_SQLITE === "true",
    url: process.env.DATABASE_URL || "",
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    database: process.env.PGDATABASE || "jobagent_db",
    user: process.env.PGUSER || "jobagent",
    password: process.env.PGPASSWORD || "jobagent_pass"
  },

  // API Keys
  rapidApiKey: process.env.RAPIDAPI_KEY || "",
  adzunaAppId: process.env.ADZUNA_APP_ID || "",
  adzunaAppKey: process.env.ADZUNA_APP_KEY || ""
};

module.exports = config;
