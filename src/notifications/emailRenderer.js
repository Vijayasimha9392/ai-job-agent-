// =====================================================================
// Email Alert Renderer - Single Summary Email & No New Jobs Found
// =====================================================================

const fs = require("fs");
const path = require("path");

/**
 * Formats ISO date to Asia/Kolkata readable string
 */
function formatDisplayDate(isoString, timezone = "Asia/Kolkata") {
  if (!isoString) return "Just now";
  try {
    const d = new Date(isoString);
    return d.toLocaleString("en-IN", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch (e) {
    return isoString;
  }
}

/**
 * Renders the single summary email for each 55-minute cycle
 * @param {Array<{job: object, evaluation: object, dispatchMeta: object}>} qualifiedJobs
 * @param {string} timezone
 * @param {string} candidateName
 * @returns {{ subject: string, html: string, text: string }}
 */
function renderSummaryEmail(qualifiedJobs = [], timezone = "Asia/Kolkata", candidateName = "Vijayasimha") {
  const count = qualifiedJobs.length;
  const firstName = candidateName ? candidateName.split(" ")[0] : "Vijayasimha";

  // CASE 1: ZERO NEW JOBS FOUND
  if (count === 0) {
    const subject = "Job Hunter AI - No New Jobs Found";
    const text = `Hi ${firstName},

No new matching jobs were found in the latest 55-minute search.

Previously emailed jobs were excluded successfully.

The agent will check again in 55 minutes.`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; }
    .wrapper { max-width: 620px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
    .header { background: linear-gradient(135deg, #1e293b, #0f172a); color: #ffffff; padding: 24px 28px; border-bottom: 3px solid #3b82f6; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0 0; color: #94a3b8; font-size: 13px; }
    .content { padding: 28px; }
    .status-card { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #64748b; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .status-card h2 { margin: 0 0 10px 0; font-size: 16px; color: #1e293b; }
    .status-card p { margin: 0 0 8px 0; font-size: 14px; line-height: 1.5; color: #475569; }
    .footer { background: #f1f5f9; padding: 16px 28px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Job Hunter AI • 55-Minute Scan Report</h1>
      <p>Autonomous Recruitment Intelligence Agent</p>
    </div>
    <div class="content">
      <div class="status-card">
        <h2>ℹ️ No New Matching Jobs Found</h2>
        <p>No new matching jobs (≥80% Java Full Stack match) were found in the latest 55-minute search.</p>
        <p>✅ All previously emailed jobs were excluded successfully to prevent duplicates.</p>
        <p>⏳ The autonomous agent is running 24/7 and will check again in 55 minutes.</p>
      </div>
    </div>
    <div class="footer">
      Automated 55-minute scheduled run • Candidate: ${candidateName}
    </div>
  </div>
</body>
</html>`;

    return { subject, html, text };
  }

  // CASE 2: MULTIPLE / NEW JOBS FOUND
  const hasCritical = qualifiedJobs.some(item => item.dispatchMeta?.priorityLevel === "CRITICAL" || (item.job.jobAgeMinutes !== null && item.job.jobAgeMinutes <= 15));
  const subject = hasCritical
    ? `🚨 Job Hunter AI — ${count} Fresh Job${count > 1 ? "s" : ""} Posted Minutes Ago`
    : `🔥 Job Hunter AI — ${count} New Matching Job${count > 1 ? "s" : ""}`;

  // Build Plain Text
  const jobTextItems = qualifiedJobs.map((item, idx) => {
    const { job, evaluation, dispatchMeta } = item;
    const isCritical = dispatchMeta?.priorityLevel === "CRITICAL" || (job.jobAgeMinutes !== null && job.jobAgeMinutes <= 15);
    const ageStr = job.jobAgeMinutes !== null 
      ? (job.jobAgeMinutes < 60 ? `${Math.round(job.jobAgeMinutes)} min ago` : `${Math.round(job.jobAgeHours)}h ago`)
      : "Recently";

    return `${idx + 1}. ${isCritical ? "[🚨 CRITICAL] " : ""}${job.title} - ${job.company}
   Location: ${job.location} (${job.workMode || "On-site"})
   Experience: ${evaluation.experienceRequired || "0-2 years"}
   Posted At: ${formatDisplayDate(job.publishedAt, timezone)} (${ageStr})
   Job Age: ${ageStr}
   Match Score: ${evaluation.matchScore}% (${evaluation.matchLevel || "Strong Match"})
   Matched Skills: ${(evaluation.matchedSkills || []).join(", ") || "Java, Spring Boot, REST APIs"}
   Missing Skills: ${(evaluation.missingSkills || []).join(", ") || "None"}
   Why It Matches: ${evaluation.whyMatched || "Direct alignment with candidate profile"}
   Source: ${job.source} (${job.sourceType || "Official ATS"})
   Job ID: ${job.jobId}
   Direct Apply: ${job.applicationUrl}`;
  }).join("\n\n");

  const text = `Hi ${firstName},

${count} new matching job${count > 1 ? "s were" : " was"} discovered in the latest scan.

${jobTextItems}

--------------------------------------------------
Previously notified jobs were excluded successfully.
The agent operates in near real-time (2-minute aggregation cycle).`;

  // Build HTML Cards
  const jobHtmlCards = qualifiedJobs.map((item, idx) => {
    const { job, evaluation, dispatchMeta } = item;
    const isCritical = dispatchMeta?.priorityLevel === "CRITICAL" || (job.jobAgeMinutes !== null && job.jobAgeMinutes <= 15);
    const ageStr = job.jobAgeMinutes !== null 
      ? (job.jobAgeMinutes < 60 ? `${Math.round(job.jobAgeMinutes)} min ago` : `${Math.round(job.jobAgeHours)}h ago`)
      : "Recently";

    const matchedList = (evaluation.matchedSkills || []).slice(0, 6);
    const matchedChips = matchedList.map(s => `<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin:2px;">✓ ${s}</span>`).join(" ");

    const missingList = (evaluation.missingSkills || []).slice(0, 3);
    const missingChips = missingList.map(s => `<span style="display:inline-block;background:#fef2f2;color:#b91c1c;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin:2px;">✗ ${s}</span>`).join(" ");

    return `
    <div style="background:#ffffff;border:1px solid ${isCritical ? '#f87171' : '#e2e8f0'};border-left:4px solid ${isCritical ? '#dc2626' : '#2563eb'};border-radius:8px;padding:18px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <span style="background:${isCritical ? '#dc2626' : '#1e293b'};color:#ffffff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;margin-right:6px;">#${idx + 1} ${isCritical ? "🚨 CRITICAL" : ""}</span>
          <span style="font-size:16px;font-weight:700;color:#0f172a;">${job.title}</span>
          <div style="font-size:14px;font-weight:600;color:#2563eb;margin-top:2px;">${job.company} • <span style="color:#64748b;font-size:12px;">via ${job.source}</span></div>
        </div>
        <div style="text-align:right;">
          <span style="background:${isCritical ? '#dc2626' : '#16a34a'};color:#ffffff;font-size:12px;font-weight:700;padding:4px 9px;border-radius:20px;white-space:nowrap;">
            ${evaluation.matchScore}% Match
          </span>
        </div>
      </div>

      <div style="font-size:13px;color:#475569;margin-bottom:10px;line-height:1.5;">
        📍 <strong>Location:</strong> ${job.location} (${job.workMode || "On-site"})<br>
        💼 <strong>Experience:</strong> ${evaluation.experienceRequired || "0-2 years"}<br>
        🕒 <strong>Posted:</strong> ${formatDisplayDate(job.publishedAt, timezone)} (<strong>${ageStr}</strong>)<br>
        🆔 <strong>Job ID:</strong> <code>${job.jobId}</code>
      </div>

      ${matchedChips ? `<div style="margin-bottom:6px;"><strong>Matched:</strong> ${matchedChips}</div>` : ""}
      ${missingChips ? `<div style="margin-bottom:10px;"><strong>Missing:</strong> ${missingChips}</div>` : ""}

      <div style="background:#f8fafc;border-left:3px solid #3b82f6;padding:8px 12px;font-size:12px;color:#334155;margin-bottom:14px;border-radius:0 4px 4px 0;">
        💡 <strong>Why Matched:</strong> ${evaluation.whyMatched}
      </div>

      <div>
        <a href="${job.applicationUrl}" target="_blank" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:9px 18px;border-radius:6px;text-align:center;">
          👉 Apply Directly on Official Portal
        </a>
      </div>
    </div>
    `;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; }
    .wrapper { max-width: 640px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
    .header { background: linear-gradient(135deg, #1e293b, #0f172a); color: #ffffff; padding: 24px 28px; border-bottom: 3px solid #2563eb; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0 0; color: #94a3b8; font-size: 13px; }
    .content { padding: 24px; background: #f8fafc; }
    .banner { background: #dbeafe; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 6px; font-size: 14px; color: #1e40af; margin-bottom: 20px; font-weight: 600; }
    .footer { background: #f1f5f9; padding: 16px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${hasCritical ? "🚨 Job Hunter AI • Critical Alert" : "🔥 Job Hunter AI • Live Alert"}</h1>
      <p>Near Real-Time Multi-Channel Intelligence for ${candidateName}</p>
    </div>
    <div class="content">
      <div class="banner">
        🎉 ${count} newly published matching job${count > 1 ? "s were" : " was"} discovered!
      </div>
      ${jobHtmlCards}
    </div>
    <div class="footer">
      ✅ Previously notified jobs are automatically excluded.<br>
      ⚡ Near real-time discovery engine running 24/7.
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

// Backwards compatibility alias for single job tests
function renderJobAlertEmail(job, evaluation, dispatchMeta, timezone = "Asia/Kolkata") {
  return renderSummaryEmail([{ job, evaluation, dispatchMeta }], timezone, "Vijayasimha");
}

module.exports = {
  renderSummaryEmail,
  renderJobAlertEmail,
  formatDisplayDate
};

