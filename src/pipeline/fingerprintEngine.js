// =====================================================================
// Job Deduplication & SHA-256 Fingerprint Generator
// =====================================================================

const crypto = require("crypto");

/**
 * Normalizes title string for deterministic hashing
 */
function normalizeTitleForHashing(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes company name for hashing
 */
function normalizeCompanyForHashing(company) {
  if (!company) return "";
  return company
    .toLowerCase()
    .replace(/\b(inc|ltd|limited|pvt|private|corp|corporation|llc|technologies|technology|solutions|services|software|consulting|group|global|systems|infotech)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates canonical SHA-256 fingerprint for a job
 * @param {object} job
 * @returns {string} 64-char hex hash
 */
function generateJobFingerprint(job) {
  const normCompany = normalizeCompanyForHashing(job.company);
  const normTitle = normalizeTitleForHashing(job.title);
  const refId = (job.jobReferenceId || "").trim().toLowerCase();
  const applyUrl = (job.applicationUrl || "").split("?")[0].trim().toLowerCase(); // strip tracking query params
  const location = (job.location || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  let canonicalString;
  if (refId && refId.length > 2 && refId !== "null" && refId !== "undefined") {
    // Primary: SHA256(normalizedCompany + normalizedTitle + jobReferenceId + applicationUrl)
    canonicalString = `${normCompany}|${normTitle}|${refId}|${applyUrl}`;
  } else {
    // Fallback: SHA256(normalizedCompany + normalizedTitle + location + applicationUrl)
    canonicalString = `${normCompany}|${normTitle}|${location}|${applyUrl}`;
  }

  return crypto.createHash("sha256").update(canonicalString).digest("hex");
}

module.exports = {
  generateJobFingerprint,
  normalizeTitleForHashing,
  normalizeCompanyForHashing
};
