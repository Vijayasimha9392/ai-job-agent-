// =====================================================================
// Environment Variables Loader & Config Validator
// Zero external dependencies
// =====================================================================

const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------
// .env Loader
// ---------------------------------------------------------------------

function loadEnvFile() {
  const envPath = path.resolve(__dirname, "../../.env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  try {
    const content = fs.readFileSync(envPath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const equalsIndex = trimmed.indexOf("=");

      if (equalsIndex <= 0) {
        continue;
      }

      const key = trimmed.substring(0, equalsIndex).trim();

      let value = trimmed.substring(equalsIndex + 1).trim();

      // Remove matching single/double quotes.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.substring(1, value.length - 1);
      }

      // Preserve externally provided environment variables.
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn(
      `[Config] Unable to read .env file: ${error.message}`
    );
  }
}

loadEnvFile();

// ---------------------------------------------------------------------
// Parsing Helpers
// ---------------------------------------------------------------------

function getString(name, fallback = "") {
  const value = process.env[name];

  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function getInt(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);

  return Number.isFinite(value) ? value : fallback;
}

function getFloat(name, fallback) {
  const value = Number.parseFloat(process.env[name]);

  return Number.isFinite(value) ? value : fallback;
}

function getBoolean(name, fallback = false) {
  const value = process.env[name];

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim().toLowerCase() === "true";
}

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------

const candidateEmail = (
  getString("CANDIDATE_EMAIL") ||
  getString("ALERT_RECEIVER_EMAIL")
).trim();

const config = {
  // Application
  nodeEnv: getString("NODE_ENV", "production"),
  port: getInt("PORT", 3000),

  // Test / mock behavior
  allowTestJobs: getBoolean("ALLOW_TEST_JOBS", false),
  allowMockData: getBoolean("ALLOW_MOCK_DATA", false),

  // Gemini
  geminiApiKey: getString("GEMINI_API_KEY"),
  geminiModel: getString(
    "GEMINI_MODEL",
    "gemini-3.8-flash"
  ),

  // Candidate
  candidateName: getString(
    "CANDIDATE_NAME",
    "Vijayasimha Tammineni"
  ),

  // No hardcoded email recipient.
  candidateEmail,

  // Match thresholds
  minMatchScore: getInt("MIN_MATCH_SCORE", 65),
  minMatchScoreCritical: getInt("MIN_MATCH_SCORE_CRITICAL", 60),
  minMatchScoreToEmail: getInt("MIN_MATCH_SCORE_TO_EMAIL", 65),

  // Freshness
  maxJobAgeHours: getFloat("MAX_JOB_AGE_HOURS", 30),
  safetyBufferMinutes: getInt("SAFETY_BUFFER_MINUTES", 15),
  timezone: getString("TIMEZONE", "Asia/Kolkata"),

  // Scan scheduling
  scheduleIntervalMinutes: getInt(
    "SCHEDULE_INTERVAL_MINUTES",
    55
  ),

  // Polling strategy
  polling: {
    fastMinutes: getInt("POLL_INTERVAL_FAST_MINUTES", 2),
    normalMinutes: getInt("POLL_INTERVAL_NORMAL_MINUTES", 5),
    restrictedMinutes: getInt(
      "POLL_INTERVAL_RESTRICTED_MINUTES",
      15
    ),
    aggregationWindowMinutes: getInt(
      "AGGREGATION_WINDOW_MINUTES",
      2
    )
  },

  // Notifications
  notifications: {
    enableEmail: getBoolean(
      "ENABLE_EMAIL_NOTIFICATIONS",
      true
    ),
    enableTelegram: getBoolean(
      "ENABLE_TELEGRAM_NOTIFICATIONS",
      true
    ),
    enablePush: getBoolean(
      "ENABLE_PUSH_NOTIFICATIONS",
      true
    )
  },

  // SMTP
  smtp: {
    host: getString("SMTP_HOST", "smtp.gmail.com"),
    port: getInt("SMTP_PORT", 465),
    secure: getBoolean("SMTP_SECURE", true),
    user: getString("SMTP_USER"),
    pass: getString("SMTP_PASS"),
    from: getString(
      "SMTP_FROM",
      "Job Hunter AI <noreply@example.com>"
    ),

    // No default/hardcoded recipient.
    receiverEmail: (
      getString("ALERT_RECEIVER_EMAIL") ||
      getString("CANDIDATE_EMAIL")
    ).trim()
  },

  // Telegram
  telegram: {
    botToken: getString("TELEGRAM_BOT_TOKEN"),
    chatId: getString("TELEGRAM_CHAT_ID")
  },

  // Firebase
  firebase: {
    projectId: getString("FIREBASE_PROJECT_ID"),
    clientEmail: getString("FIREBASE_CLIENT_EMAIL"),
    privateKey: getString("FIREBASE_PRIVATE_KEY")
      .replace(/\\n/g, "\n")
  },

  // Database
  database: {
    useSqlite: getBoolean("USE_SQLITE", false),

    url:
      getString("DATABASE_URL") ||
      getString("SUPABASE_URL"),

    supabaseKey: getString("SUPABASE_KEY"),

    host: getString("PGHOST", "localhost"),
    port: getInt("PGPORT", 5432),
    database: getString("PGDATABASE", "jobagent_db"),
    user: getString("PGUSER", "jobagent"),
    password: getString("PGPASSWORD", "jobagent_pass")
  },

  // Job API providers
  rapidApiKey:
    getString("RAPIDAPI_KEY") ||
    getString("JSEARCH_API_KEY"),

  adzunaAppId: getString("ADZUNA_APP_ID"),
  adzunaAppKey: getString("ADZUNA_APP_KEY")
};

// ---------------------------------------------------------------------
// Basic Config Validation
// ---------------------------------------------------------------------

if (config.port < 1 || config.port > 65535) {
  console.warn(
    "[Config] PORT is invalid. Expected a value between 1 and 65535."
  );
}

if (config.maxJobAgeHours <= 0) {
  console.warn(
    "[Config] MAX_JOB_AGE_HOURS must be positive."
  );
}

if (config.scheduleIntervalMinutes < 1) {
  console.warn(
    "[Config] SCHEDULE_INTERVAL_MINUTES must be at least 1."
  );
}

if (!config.geminiApiKey) {
  console.warn(
    "[Config] GEMINI_API_KEY is not configured. Gemini evaluation and automated qualification will fail closed."
  );
}

if (!config.candidateEmail) {
  console.warn(
    "[Config] CANDIDATE_EMAIL is not configured. Email notifications will not have a recipient."
  );
}

module.exports = config;
