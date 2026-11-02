```javascript
// =====================================================================
// Email Notification Service
// Nodemailer + Gmail SMTP
// Reliable delivery, retries and strict simulation handling
// =====================================================================

const config = require("../config/env");
const { renderSummaryEmail } = require("./emailRenderer");

let nodemailer = null;
let transporter = null;

try {
  nodemailer = require("nodemailer");
} catch (error) {
  console.warn(
    "[Email Service] Nodemailer package is not installed."
  );
}

// =====================================================================
// Constants
// =====================================================================

const RETRY_COUNT = 3;

const RETRY_DELAY_MS = 2000;

const RETRYABLE_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNECTION",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ESOCKET",
  "EDNS"
]);

const RETRYABLE_SMTP_CODES = new Set([
  421,
  450,
  451,
  452
]);

// =====================================================================
// Helpers
// =====================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getRecipient() {
  return (
    config.smtp.receiverEmail ||
    config.candidateEmail ||
    ""
  ).trim();
}

function getSender() {
  const configuredFrom = String(
    config.smtp.from || ""
  ).trim();

  if (
    !configuredFrom ||
    configuredFrom.includes("noreply@example.com")
  ) {
    return config.smtp.user;
  }

  return configuredFrom;
}

function getErrorMessage(error) {
  return error?.message || String(error);
}

function isRetryableError(error) {
  if (!error) {
    return false;
  }

  if (RETRYABLE_ERROR_CODES.has(error.code)) {
    return true;
  }

  if (RETRYABLE_SMTP_CODES.has(Number(error.responseCode))) {
    return true;
  }

  return false;
}

// =====================================================================
// SMTP Configuration
// =====================================================================

function hasValidSmtpConfiguration() {
  return Boolean(
    nodemailer &&
    config.smtp.host &&
    config.smtp.port &&
    config.smtp.user &&
    config.smtp.pass &&
    isValidEmail(config.smtp.user) &&
    isValidEmail(getRecipient())
  );
}

// =====================================================================
// Transporter
// =====================================================================

function getTransporter() {
  if (!nodemailer) {
    return null;
  }

  if (!hasValidSmtpConfiguration()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,

      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass.replace(/\s+/g, "")
      },

      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,

      // Keep TLS certificate verification enabled.
      tls: {
        rejectUnauthorized: true
      }
    });
  }

  return transporter;
}

// =====================================================================
// Delivery Confirmation
// =====================================================================

function isEmailAccepted(info) {
  if (!info) {
    return false;
  }

  if (Array.isArray(info.accepted)) {
    return info.accepted.length > 0;
  }

  // Nodemailer normally provides accepted recipients.
  // A message ID is used as a fallback for compatible transports.
  return Boolean(info.messageId);
}

// =====================================================================
// Email Sending
// =====================================================================

/**
 * Sends a consolidated job alert email.
 *
 * @param {Array} batch
 * @param {boolean} sendIfEmpty
 *
 * @returns {Promise<object>}
 */
async function sendBatch(batch = [], sendIfEmpty = false) {
  const count = Array.isArray(batch) ? batch.length : 0;

  const recipient = getRecipient();

  // -------------------------------------------------------------------
  // Step 1: Validate batch
  // -------------------------------------------------------------------

  if (!Array.isArray(batch)) {
    return {
      success: false,
      simulated: false,
      error: "Invalid notification batch.",
      count: 0
    };
  }

  if (count === 0 && !sendIfEmpty) {
    return {
      success: true,
      skipped: true,
      count: 0,
      reason: "No new jobs in this run."
    };
  }

  // -------------------------------------------------------------------
  // Step 2: Validate email configuration
  // -------------------------------------------------------------------

  if (!nodemailer) {
    console.warn(
      "[Email Service] Nodemailer is unavailable. Email not sent."
    );

    return {
      success: false,
      simulated: true,
      count,
      error: "Nodemailer is not installed."
    };
  }

  if (!recipient || !isValidEmail(recipient)) {
    console.warn(
      "[Email Service] Valid recipient email is not configured."
    );

    return {
      success: false,
      simulated: true,
      count,
      error: "Missing or invalid recipient email."
    };
  }

  if (
    !config.smtp.host ||
    !config.smtp.user ||
    !config.smtp.pass ||
    !isValidEmail(config.smtp.user)
  ) {
    console.warn(
      "[Email Service] SMTP credentials are incomplete. Email not sent."
    );

    return {
      success: false,
      simulated: true,
      count,
      error: "SMTP configuration is incomplete."
    };
  }

  // -------------------------------------------------------------------
  // Step 3: Render email
  // -------------------------------------------------------------------

  let emailPayload;

  try {
    emailPayload = renderSummaryEmail(
      batch,
      config.timezone,
      config.candidateName
    );
  } catch (error) {
    console.error(
      "[Email Service] Email rendering failed:",
      error.message
    );

    return {
      success: false,
      simulated: false,
      count,
      error: `Email rendering failed: ${error.message}`
    };
  }

  if (
    !emailPayload ||
    !emailPayload.subject ||
    !emailPayload.text ||
    !emailPayload.html
  ) {
    return {
      success: false,
      simulated: false,
      count,
      error: "Email renderer returned an invalid payload."
    };
  }

  // -------------------------------------------------------------------
  // Step 4: Prepare message
  // -------------------------------------------------------------------

  const hasCritical = batch.some(item => {
    const age = Number(item.job?.jobAgeMinutes);

    return (
      item.dispatchMeta?.priorityLevel === "CRITICAL" ||
      (
        Number.isFinite(age) &&
        age >= 0 &&
        age <= 15
      )
    );
  });

  const mailOptions = {
    from: getSender(),
    to: recipient,

    subject: hasCritical
      ? `🚨 CRITICAL: ${emailPayload.subject}`
      : emailPayload.subject,

    text: emailPayload.text,
    html: emailPayload.html,

    headers: {
      "X-Job-Hunter-Count": String(count),
      "X-Priority": hasCritical ? "1" : "3"
    }
  };

  // -------------------------------------------------------------------
  // Step 5: Get SMTP transporter
  // -------------------------------------------------------------------

  let client;

  try {
    client = getTransporter();
  } catch (error) {
    console.error(
      "[Email Service] SMTP transporter initialization failed:",
      error.message
    );

    return {
      success: false,
      simulated: false,
      count,
      error: error.message
    };
  }

  if (!client) {
    return {
      success: false,
      simulated: true,
      count,
      error: "SMTP transporter could not be initialized."
    };
  }

  // -------------------------------------------------------------------
  // Step 6: Send with controlled retries
  // -------------------------------------------------------------------

  let lastError = null;

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      console.log(
        `📧 [Email Service] Sending ${count} job(s) to ${recipient}.`
      );

      const info = await client.sendMail(mailOptions);

      if (!isEmailAccepted(info)) {
        return {
          success: false,
          simulated: false,
          count,
          error: "SMTP did not confirm acceptance of the email."
        };
      }

      console.log(
        `✅ [Email Service] Email accepted by SMTP.`
      );

      console.log(
        `   Recipient: ${recipient}`
      );

      console.log(
        `   Message ID: ${info.messageId || "Not provided"}`
      );

      console.log(
        `   Jobs included: ${count}`
      );

      return {
        success: true,
        simulated: false,
        count,
        messageId: info.messageId || null,
        accepted: info.accepted || []
      };

    } catch (error) {
      lastError = error;

      console.error(
        `❌ [Email Service] Attempt ${attempt}/${RETRY_COUNT} failed:`,
        error.message
      );

      // Do not retry permanent authentication/configuration errors.
      if (!isRetryableError(error)) {
        break;
      }

      if (attempt < RETRY_COUNT) {
        const delay =
          RETRY_DELAY_MS * Math.pow(2, attempt - 1);

        console.log(
          `⏳ [Email Service] Retrying in ${delay / 1000} seconds...`
        );

        await sleep(delay);
      }
    }
  }

  // -------------------------------------------------------------------
  // Step 7: Final failure
  // -------------------------------------------------------------------

  console.error(
    "[Email Service] Email delivery failed after retry attempts."
  );

  return {
    success: false,
    simulated: false,
    count,
    error: getErrorMessage(lastError),
    errorCode: lastError?.code || null
  };
}

// =====================================================================
// SMTP Verification
// =====================================================================

/**
 * Verifies SMTP connectivity and authentication.
 * This does not send an email.
 */
async function verifySmtpConnection() {
  const client = getTransporter();

  if (!client) {
    return {
      success: false,
      error: "SMTP configuration is incomplete."
    };
  }

  try {
    await client.verify();

    console.log(
      "✅ [Email Service] SMTP connection verified successfully."
    );

    return {
      success: true,
      message: "SMTP connection and authentication verified."
    };

  } catch (error) {
    console.error(
      "❌ [Email Service] SMTP verification failed:",
      error.message
    );

    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
}

// =====================================================================
// Exports
// =====================================================================

module.exports = {
  sendBatch,
  getTransporter,
  verifySmtpConnection,
  isValidEmail
};
```
