// =====================================================================
// Email Notification Service - Nodemailer + Gmail SMTP Transport
// =====================================================================

const config = require("../config/env");
const { renderSummaryEmail } = require("./emailRenderer");

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (e) {}

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
 * Sends multi-job summary email for a notification batch
 * @param {Array<{job: object, fingerprint: string, evaluation: object, dispatchMeta: object}>} batch
 * @returns {Promise<{ success: boolean, messageId?: string, simulated?: boolean, error?: string, count: number }>}
 */
async function sendBatch(batch = [], sendIfEmpty = false) {
  const recipient = config.smtp.receiverEmail || config.candidateEmail;
  const count = batch.length;

  if (count === 0 && !sendIfEmpty) {
    return { success: true, count: 0, reason: "No new jobs in this run" };
  }

  const emailPayload = renderSummaryEmail(batch, config.timezone, config.candidateName);

  if (!recipient || recipient === "candidate_email@example.com" || !nodemailer || !config.smtp.user) {
    console.log(`\n📧 [EMAIL SERVICE (SIMULATION)] Summary of ${count} new jobs`);
    console.log(`   Subject: ${emailPayload.subject}`);
    console.log(`   Recipient: ${recipient || "candidate@preview.local"}`);
    return { success: true, simulated: true, count };
  }

  const hasCritical = batch.some(b => b.dispatchMeta?.priorityLevel === "CRITICAL" || (b.job?.jobAgeMinutes !== null && b.job?.jobAgeMinutes <= 15));

  const mailOptions = {
    from: config.smtp.from,
    to: recipient,
    subject: hasCritical ? `🚨 CRITICAL: ${emailPayload.subject}` : emailPayload.subject,
    text: emailPayload.text,
    html: emailPayload.html,
    headers: {
      "X-Job-Hunter-Count": String(count),
      "X-Priority": hasCritical ? "1" : "3"
    }
  };

  let lastError = null;
  const retryCount = 3;

  for (let i = 0; i < retryCount; i++) {
    try {
      const client = getTransporter();
      const info = await client.sendMail(mailOptions);
      console.log(`🚀 [Email Service] Successfully dispatched batch (${count} jobs) to ${recipient}: ${info.messageId}`);
      return { success: true, messageId: info.messageId, count };
    } catch (err) {
      lastError = err;
      console.error(`❌ [Email Service] Attempt ${i + 1}/${retryCount} failed: ${err.message}`);
      if (i < retryCount - 1) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, i)));
      }
    }
  }

  return { success: false, error: lastError?.message, count };
}

module.exports = {
  sendBatch,
  getTransporter
};
