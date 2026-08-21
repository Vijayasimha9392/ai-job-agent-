// =====================================================================
// Email Notification Sender - Single Summary SMTP Transport
// =====================================================================

const config = require("../config/env");
const { logEmailSent, markBatchJobsAsEmailed } = require("../db/database");

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  // Operates in simulation mode if nodemailer missing
}

let transporter = null;

function getTransporter() {
  if (!transporter && nodemailer) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass ? config.smtp.pass.replace(/\s+/g, "") : ""
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return transporter;
}

/**
 * Sends a single combined summary email for the completed 55-minute cycle
 * @param {Array<{job: object, fingerprint: string, evaluation: object, dispatchMeta: object}>} qualifiedJobsWithMeta
 * @param {{ subject: string, html: string, text: string }} emailPayload
 * @returns {Promise<{ success: boolean, messageId?: string, simulated?: boolean, error?: string }>}
 */
async function sendSummaryAlertEmail(qualifiedJobsWithMeta = [], emailPayload) {
  const recipient = config.candidateEmail;
  const count = qualifiedJobsWithMeta.length;

  if (!recipient || recipient === "candidate_email@example.com" || !nodemailer) {
    console.log(`\n📧 [EMAIL SIMULATION LOG] 55-Minute Cycle Summary`);
    console.log(`   Subject: ${emailPayload.subject}`);
    console.log(`   Total Jobs in Email: ${count}`);
    console.log(`   Recipient: ${recipient || "candidate@preview.local"}`);

    if (count > 0) {
      await markBatchJobsAsEmailed(
        qualifiedJobsWithMeta,
        recipient || "candidate@preview.local",
        emailPayload.subject
      );
    }
    return { success: true, simulated: true };
  }

  const mailOptions = {
    from: config.smtp.from,
    to: recipient,
    subject: emailPayload.subject,
    text: emailPayload.text,
    html: emailPayload.html,
    headers: {
      "X-Job-Hunter-Count": String(count),
      "X-Job-Hunter-Cycle": "55min"
    }
  };

  let lastError = null;
  const retryCount = 3;

  for (let i = 0; i < retryCount; i++) {
    try {
      const client = getTransporter();
      const info = await client.sendMail(mailOptions);
      console.log(`🚀 [Email Sent] Successfully dispatched summary alert (${count} jobs) to ${recipient}: ${info.messageId}`);

      // ONLY mark jobs as EMAILED after the email is successfully dispatched
      if (count > 0) {
        await markBatchJobsAsEmailed(qualifiedJobsWithMeta, recipient, emailPayload.subject);
        console.log(`✅ [Database] Marked ${count} jobs as EMAILED with timestamp.`);
      }

      return { success: true, messageId: info.messageId };
    } catch (err) {
      lastError = err;
      console.error(`❌ [Email] Send attempt ${i + 1}/${retryCount} failed: ${err.message}`);
      if (i < retryCount - 1) {
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  }

  // Delivery failed - do NOT mark jobs as emailed so they can be retried in the next 55-minute cycle
  console.error(`⚠️ [Email] Summary email failed. Jobs will NOT be marked as EMAILED so they can be retried.`);
  return { success: false, error: lastError?.message };
}

// Backwards compatibility alias for single job tests
async function sendJobAlertEmail(job, fingerprint, evaluation, dispatchMeta, emailPayload) {
  return sendSummaryAlertEmail(
    [{ job, fingerprint, evaluation, dispatchMeta }],
    emailPayload
  );
}

module.exports = {
  sendSummaryAlertEmail,
  sendJobAlertEmail
};

