// =====================================================================
// Source Fetcher: SmartRecruiters Public Career Feeds
// =====================================================================

const { normalizeJob } = require("../pipeline/normalizer");

const SMARTRECRUITERS_COMPANIES = [
  { company: "Publicis Sapient", identifier: "PublicisGroupe" },
  { company: "Bosch", identifier: "BoschGroup" },
  { company: "Visa", identifier: "Visa" }
];

async function fetchSmartRecruitersJobs(company, identifier) {
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${identifier}/postings?country=in&limit=25`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const data = await response.json();
    const postings = data?.content || [];

    return postings
      .filter(p => {
        const title = (p.name || "").toLowerCase();
        return title.includes("software") || title.includes("engineer") || title.includes("developer") || 
               title.includes("java") || title.includes("backend");
      })
      .map(p => {
        return normalizeJob({
          jobId: `sr_${identifier}_${p.id}`,
          source: "SmartRecruiters",
          sourceType: "Official ATS",
          company,
          title: p.name,
          location: p.location?.city ? `${p.location.city}, India` : "India",
          workMode: p.location?.remote ? "Remote" : "On-site",
          employmentType: p.typeOfEmployment?.label || "Full-time",
          description: p.jobAd?.sections?.jobDescription?.text || "",
          skills: [],
          minimumExperience: null,
          maximumExperience: null,
          education: "Bachelor's Degree in CS/IT",
          publishedAt: p.releasedDate || new Date().toISOString(),
          applicationUrl: `https://jobs.smartrecruiters.com/${identifier}/${p.id}`,
          companyCareersUrl: `https://careers.smartrecruiters.com/${identifier}`,
          salary: "Not Disclosed",
          jobReferenceId: String(p.id)
        }, "SmartRecruiters");
      });
  } catch (err) {
    return [];
  }
}

async function fetchAllSmartRecruitersJobs() {
  const promises = SMARTRECRUITERS_COMPANIES.map(c => fetchSmartRecruitersJobs(c.company, c.identifier));
  const results = await Promise.allSettled(promises);
  const jobs = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      jobs.push(...r.value);
    }
  }
  return jobs;
}

module.exports = {
  fetchAllSmartRecruitersJobs,
  fetchSmartRecruitersJobs,
  SMARTRECRUITERS_COMPANIES
};
