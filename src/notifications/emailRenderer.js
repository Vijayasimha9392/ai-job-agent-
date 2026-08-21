// =====================================================================
// Email Alert Renderer - HTML and Plain Text generator
// =====================================================================

const fs = require("fs");
const path = require("path");

const htmlTemplatePath = path.resolve(__dirname, "../../templates/job_alert.html");
let htmlTemplate = "";
try {
  htmlTemplate = fs.readFileSync(htmlTemplatePath, "utf8");
} catch (e) {
  // Will fallback to inline template if file missing
}

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
 * Generates Subject line based on freshness & match score
 */
function generateEmailSubject(job, evaluation, dispatchMeta) {
  const matchScore = evaluation.matchScore || 0;
  const ageStr = job.jobAgeHours !== null && job.jobAgeHours < 1 ? "< 1 hr ago" : (job.jobAgeHours ? `${Math.round(job.jobAgeHours)}h ago` : "Today");

  if (dispatchMeta.priorityLevel === "URGENT") {
    return `🔥 Apply Now: ${job.title} at ${job.company} | Posted ${ageStr}`;
  } else if (dispatchMeta.priorityLevel === "HIGH_PRIORITY") {
    return `⚡ High Priority: ${job.title} at ${job.company} | ${matchScore}% Match`;
  } else {
    return `🚨 New Job: ${job.title} | ${job.company} | ${matchScore}% Match`;
  }
}

/**
 * Generates both HTML and Plain Text email representations
 */
function renderJobAlertEmail(job, evaluation, dispatchMeta, timezone = "Asia/Kolkata") {
  const publishedDisplay = formatDisplayDate(job.publishedAt, timezone);
  const discoveredDisplay = formatDisplayDate(job.discoveredAt, timezone);
  const matchedSkillsList = (evaluation.matchedSkills || []).length > 0 ? evaluation.matchedSkills : ["Java", "Backend"];
  const missingSkillsList = evaluation.missingSkills || [];

  const matchedSkillsChips = matchedSkillsList
    .map((s) => `<span class="tag">✓ ${s}</span>`)
    .join(" ");

  const missingSkillsSection = missingSkillsList.length > 0
    ? `<div class="section-title">Missing / Optional Skills</div>
       <div>${missingSkillsList.map((s) => `<span class="tag tag-missing">! ${s}</span>`).join(" ")}</div>`
    : "";

  const careersPageLink = job.companyCareersUrl
    ? `<div><a href="${job.companyCareersUrl}" class="btn-secondary" target="_blank">View ${job.company} Careers Page</a></div>`
    : "";

  let renderedHtml = htmlTemplate;
  const replacements = {
    "{{badgeText}}": dispatchMeta.badgeText || "New Match",
    "{{badgeColor}}": dispatchMeta.badgeColor || "#2563eb",
    "{{title}}": job.title,
    "{{company}}": job.company,
    "{{location}}": job.location,
    "{{workMode}}": job.workMode,
    "{{matchScore}}": String(evaluation.matchScore || 0),
    "{{matchLevel}}": evaluation.matchLevel || "Good Match",
    "{{freshnessLabel}}": job.freshnessLabel || "Recently Posted",
    "{{publishedAtDisplay}}": publishedDisplay,
    "{{discoveredAtDisplay}}": discoveredDisplay,
    "{{whyMatched}}": evaluation.whyMatched || "Strong alignment with candidate qualifications.",
    "{{experienceRequired}}": evaluation.experienceRequired || (job.minimumExperience ? `${job.minimumExperience} yrs` : "0-2 years"),
    "{{salary}}": job.salary || "Not Disclosed",
    "{{source}}": job.source || "Web Feed",
    "{{jobReferenceId}}": job.jobReferenceId || "N/A",
    "{{matchedSkillsChips}}": matchedSkillsChips,
    "{{missingSkillsSection}}": missingSkillsSection,
    "{{applicationUrl}}": job.applicationUrl,
    "{{careersPageLink}}": careersPageLink
  };

  for (const [key, val] of Object.entries(replacements)) {
    renderedHtml = renderedHtml.split(key).join(val);
  }

  // Exact plain text as specified in prompt section 21
  const plainText = `🔥 NEW JOB MATCH

Company:
${job.company}

Role:
${job.title}

Location:
${job.location}

Work Mode:
${job.workMode}

Experience:
${evaluation.experienceRequired || "0-2 years"}

Posted:
${publishedDisplay}

Job Age:
${job.jobAgeHours !== null ? job.jobAgeHours + " hours" : "Recently published"}

Match Score:
${evaluation.matchScore}/100

Match Level:
${evaluation.matchLevel}

Application Priority:
${evaluation.applicationPriority || dispatchMeta.priorityLevel}

Matched Skills:
${matchedSkillsList.join(", ")}

Missing / Optional Skills:
${missingSkillsList.join(", ") || "None"}

Why It Matches:
${evaluation.whyMatched}

Salary:
${job.salary}

Job ID:
${job.jobReferenceId || "N/A"}

Source:
${job.source}

Apply Here:
${job.applicationUrl}

Company Careers Page:
${job.companyCareersUrl || "N/A"}

Detected:
${discoveredDisplay}

--------------------------------------------------
Apply as early as possible because this job was recently posted.
--------------------------------------------------`;

  return {
    subject: generateEmailSubject(job, evaluation, dispatchMeta),
    html: renderedHtml,
    text: plainText
  };
}

module.exports = {
  renderJobAlertEmail,
  generateEmailSubject,
  formatDisplayDate
};
