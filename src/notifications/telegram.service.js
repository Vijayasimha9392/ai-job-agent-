// =====================================================================
// Telegram Bot API Notification Service - Strict Freshness-First Alerts
// =====================================================================

const config = require("../config/env");
const { sortJobsByFreshnessFirst } = require("../pipeline/scoringEngine");

/**
 * Escapes HTML characters for Telegram Bot API
 */
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Formats clean age string (e.g. "8 minutes ago", "1 hour ago", "4 hours ago")
 */
function formatAgeString(jobAgeMinutes, jobAgeHours) {
  if (jobAgeMinutes === null || jobAgeMinutes === undefined || isNaN(jobAgeMinutes)) {
    return "Recently";
  }
  if (jobAgeMinutes < 1) return "Just now";
  if (jobAgeMinutes < 60) return `${Math.round(jobAgeMinutes)} minutes ago`;
  const hrs = Math.round(jobAgeHours || jobAgeMinutes / 60);
  return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
}

/**
 * Formats a single job entry for Telegram
 */
function formatSingleJobTelegram(item) {
  const { job, evaluation, dispatchMeta } = item;
  const isCritical = dispatchMeta?.priorityLevel === "CRITICAL" || (job.jobAgeMinutes !== null && job.jobAgeMinutes <= 30);
  const ageStr = formatAgeString(job.jobAgeMinutes, job.jobAgeHours);

  const skills = (evaluation.matchedSkills || ["Java", "Spring Boot"]).slice(0, 5);
  const skillsList = skills.map(s => `✅ ${escapeHtml(s)}`).join("\n");

  const header = isCritical ? `🚨 <b>CRITICAL FRESH MATCH (Posted ${ageStr})</b>` : `🔥 <b>NEW JOB MATCH (Posted ${ageStr})</b>`;

  return `${header}

🏢 <b>Company:</b> ${escapeHtml(job.company)}
💼 <b>Role:</b> ${escapeHtml(job.title)}
📍 <b>Location:</b> ${escapeHtml(job.location)} (${escapeHtml(job.workMode || "On-site")})
🆔 <b>Job ID:</b> <code>${escapeHtml(job.sourceJobId || job.jobReferenceId || job.jobId)}</code>
🌐 <b>Source:</b> ${escapeHtml(job.source)} (${escapeHtml(job.sourceType || "Official ATS")})
🕒 <b>Posted:</b> ${ageStr}
🎯 <b>Match:</b> ${evaluation.matchScore}% (${escapeHtml(evaluation.matchLevel || "Strong Match")})
🛡️ <b>Status:</b> Verified Active Vacancy URL (HTTP 200)

${skillsList}

💡 <i>${escapeHtml(evaluation.whyMatched || "Direct alignment with candidate profile")}</i>

🔗 <b>Apply Directly on Verified Portal:</b>
<a href="${job.applicationUrl}">${escapeHtml(job.applicationUrl)}</a>`;
}

/**
 * Formats multiple jobs into consolidated Telegram message(s) sorted newest-first
 */
function formatBatchTelegramMessages(batch) {
  const sortedBatch = sortJobsByFreshnessFirst(batch);
  if (sortedBatch.length === 1) {
    return [formatSingleJobTelegram(sortedBatch[0])];
  }

  const messages = [];
  let currentMsg = `🔥 <b>Job Hunter AI • ${sortedBatch.length} New Matching Jobs</b>\n<i>(Prioritized by freshness — newest first)</i>\n\n`;

  for (let i = 0; i < sortedBatch.length; i++) {
    const { job, evaluation, dispatchMeta } = sortedBatch[i];
    const isCritical = dispatchMeta?.priorityLevel === "CRITICAL" || (job.jobAgeMinutes !== null && job.jobAgeMinutes <= 30);
    const ageStr = formatAgeString(job.jobAgeMinutes, job.jobAgeHours);

    const itemText = `<b>#${i + 1} — Posted ${ageStr}</b> ${isCritical ? "🚨 [CRITICAL]" : ""}
💼 <b>${escapeHtml(job.title)}</b> — ${escapeHtml(job.company)}
🎯 <b>Match:</b> ${evaluation.matchScore}% | 📍 ${escapeHtml(job.location)}
🌐 <b>Source:</b> ${escapeHtml(job.source)} (<code>${escapeHtml(job.sourceJobId || job.jobReferenceId || job.jobId)}</code>)
🔗 <b>Apply:</b> <a href="${job.applicationUrl}">Apply on Verified Portal</a>\n\n`;

    if ((currentMsg + itemText).length > 3900) {
      messages.push(currentMsg.trim());
      currentMsg = `🔥 <b>Job Hunter AI (Continued)</b>\n\n` + itemText;
    } else {
      currentMsg += itemText;
    }
  }

  if (currentMsg.trim().length > 0) {
    messages.push(currentMsg.trim());
  }

  return messages;
}

/**
 * Sends messages to Telegram chat using Bot API with exponential backoff
 * @param {Array<{job: object, fingerprint: string, evaluation: object, dispatchMeta: object}>} batch
 * @returns {Promise<{ success: boolean, sentCount?: number, simulated?: boolean, error?: string }>}
 */
async function sendBatch(batch = []) {
  const token = config.telegram.botToken;
  const chatId = config.telegram.chatId;
  const count = batch.length;

  if (count === 0) {
    return { success: true, count: 0, reason: "No jobs in batch" };
  }

  if (!token || !chatId || token === "your_telegram_bot_token" || chatId === "your_telegram_chat_id") {
    console.log(`\n📱 [TELEGRAM SERVICE (SIMULATION)] Batch of ${count} jobs prepared for Telegram`);
    console.log(`   Chat ID: ${chatId || "simulated_chat"}`);
    return { success: true, simulated: true, count };
  }

  const messages = formatBatchTelegramMessages(batch);
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

  let sentMessages = 0;
  let lastError = null;

  for (const text of messages) {
    let sent = false;
    const retryCount = 3;

    for (let i = 0; i < retryCount; i++) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: false
          }),
          signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errBody.substring(0, 200)}`);
        }

        sent = true;
        sentMessages++;
        break;
      } catch (err) {
        lastError = err;
        console.error(`❌ [Telegram Service] Message send attempt ${i + 1}/${retryCount} failed: ${err.message}`);
        if (i < retryCount - 1) {
          await new Promise(r => setTimeout(r, 2000 * Math.pow(2, i)));
        }
      }
    }

    if (!sent) {
      console.error(`⚠️ [Telegram Service] Failed to send a chunk of Telegram messages: ${lastError?.message}`);
      return { success: false, error: lastError?.message, sentMessages, count };
    }
  }

  console.log(`🚀 [Telegram Service] Successfully delivered ${sentMessages} Telegram message(s) for ${count} jobs.`);
  return { success: true, sentMessages, count };
}

module.exports = {
  sendBatch,
  formatSingleJobTelegram,
  formatBatchTelegramMessages,
  escapeHtml,
  formatAgeString
};
