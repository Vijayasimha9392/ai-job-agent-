// =====================================================================
// Email Notification Sender - SMTP transport with retry & preview
// =====================================================================

const config = require("../config/env");
const { logEmailSent } = require("../db/database");

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  // Will operate in simulation/preview mode if nodemailer is not installed
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
 * Sends job notification email
 * @param {object} job 
 * @param {string} fingerprint
 * @param {object} evaluation 
 * @param {object} dispatchMeta 
 * @param {object} emailPayload { subject, html, text }
 */
async function sendJobAlertEmail(job, fingerprint, evaluation, dispatchMeta, emailPayload) {
  const recipient = config.candidateEmail;

  if (!recipient || recipient === "candidate_email@example.com" || !nodemailer) {
    console.log(`\n📧 [EMAIL DISPATCH LOG] Alert for "${job.title}" at "${job.company}"`);
    console.log(`   Subject: ${emailPayload.subject}`);
    console.log(`   Priority: ${dispatchMeta.priorityLevel} | Match: ${evaluation.matchScore}%`);
    console.log(`   Direct Apply URL: ${job.applicationUrl}`);
    
    // Log as sent in local tracker
    await logEmailSent(
      job.jobId,
      fingerprint,
      recipient || "candidate@preview.local",
      emailPayload.subject,
      evaluation.matchScore,
      dispatchMeta.priorityLevel,
      "PREVIEW_LOGGED"
    );
    return { success: true, simulated: true };
  }

  const mailOptions = {
    from: config.smtp.from,
    to: recipient,
    subject: emailPayload.subject,
    text: emailPayload.text,
    html: emailPayload.html,
    headers: {
      "X-Priority": dispatchMeta.priorityLevel === "URGENT" ? "1" : "3",
      "X-Job-Agent-Score": String(evaluation.matchScore)
    }
  };

  let lastError = null;
  const retryCount = 3;

  for (let i = 0; i < retryCount; i++) {
    try {
      const client = getTransporter();
      const info = await client.sendMail(mailOptions);
      console.log(`🚀 [Email Sent] Successfully dispatched alert to ${recipient}: ${info.messageId}`);

      await logEmailSent(
        job.jobId,
        fingerprint,
        recipient,
        emailPayload.subject,
        evaluation.matchScore,
        dispatchMeta.priorityLevel,
        "SENT"
      );

      return { success: true, messageId: info.messageId };
    } catch (err) {
      lastError = err;
      console.error(`❌ [Email] Send attempt ${i + 1}/${retryCount} failed: ${err.message}`);
      if (i < retryCount - 1) {
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  }

  await logEmailSent(
    job.jobId,
    fingerprint,
    recipient,
    emailPayload.subject,
    evaluation.matchScore,
    dispatchMeta.priorityLevel,
    "FAILED",
    lastError?.message
  );

  return { success: false, error: lastError?.message };
}

module.exports = { sendJobAlertEmail };
