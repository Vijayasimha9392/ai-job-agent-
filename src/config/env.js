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
  port: parseInt(process.env.PORT || "3000", 10),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  candidateName: process.env.CANDIDATE_NAME || "Vijayasimha Tammineni",
  candidateEmail: (process.env.CANDIDATE_EMAIL || process.env.ALERT_RECEIVER_EMAIL || "thornay7@gmail.com").trim(),
  minMatchScore: parseInt(process.env.MIN_MATCH_SCORE || "65", 10),
  minMatchScoreCritical: parseInt(process.env.MIN_MATCH_SCORE_CRITICAL || "60", 10),
  minMatchScoreToEmail: parseInt(process.env.MIN_MATCH_SCORE_TO_EMAIL || "65", 10),
  maxJobAgeHours: parseFloat(process.env.MAX_JOB_AGE_HOURS || "40"),
  safetyBufferMinutes: parseInt(process.env.SAFETY_BUFFER_MINUTES || "15", 10),
  timezone: process.env.TIMEZONE || "Asia/Kolkata",

  // Polling Strategy (Source-specific intervals)
  polling: {
    fastMinutes: parseInt(process.env.POLL_INTERVAL_FAST_MINUTES || "2", 10),
    normalMinutes: parseInt(process.env.POLL_INTERVAL_NORMAL_MINUTES || "5", 10),
    restrictedMinutes: parseInt(process.env.POLL_INTERVAL_RESTRICTED_MINUTES || "15", 10),
    aggregationWindowMinutes: parseInt(process.env.AGGREGATION_WINDOW_MINUTES || "2", 10)
  },

  // Notification Channel Toggles
  notifications: {
    enableEmail: process.env.ENABLE_EMAIL_NOTIFICATIONS !== "false",
    enableTelegram: process.env.ENABLE_TELEGRAM_NOTIFICATIONS !== "false",
    enablePush: process.env.ENABLE_PUSH_NOTIFICATIONS !== "false"
  },

  // SMTP Settings
  smtp: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: process.env.SMTP_SECURE !== "false",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Job Hunter AI <noreply@jobhunter.ai>",
    receiverEmail: process.env.ALERT_RECEIVER_EMAIL || process.env.CANDIDATE_EMAIL || "thornay7@gmail.com"
  },

  // Telegram Bot API
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || ""
  },

  // Firebase Cloud Messaging (Push Notifications)
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  },

  // Database / Supabase
  database: {
    useSqlite: process.env.USE_SQLITE === "true",
    url: process.env.DATABASE_URL || process.env.SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_KEY || "",
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    database: process.env.PGDATABASE || "jobagent_db",
    user: process.env.PGUSER || "jobagent",
    password: process.env.PGPASSWORD || "jobagent_pass"
  },

  // API Keys
  rapidApiKey: process.env.RAPIDAPI_KEY || process.env.JSEARCH_API_KEY || "",
  adzunaAppId: process.env.ADZUNA_APP_ID || "",
  adzunaAppKey: process.env.ADZUNA_APP_KEY || ""
};

module.exports = config;
