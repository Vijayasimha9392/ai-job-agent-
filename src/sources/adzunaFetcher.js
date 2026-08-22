// =====================================================================
// Source Fetcher: Adzuna India Developer Jobs API using native fetch
// =====================================================================

const config = require("../config/env");
const { normalizeJob } = require("../pipeline/normalizer");

async function fetchAdzunaJobs(what = "Java Developer") {
  if (!config.adzunaAppId || !config.adzunaAppKey) {
    return [];
  }

  try {
    const url = new URL("https://api.adzuna.com/v1/api/jobs/in/search/1");
    url.searchParams.set("app_id", config.adzunaAppId.trim());
    url.searchParams.set("app_key", config.adzunaAppKey.trim());
    url.searchParams.set("what", what);
    url.searchParams.set("results_per_page", "25");
    url.searchParams.set("max_days_old", "7");
    url.searchParams.set("sort_by", "date");

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) return [];
    const json = await response.json();
    const results = json?.results || [];

    return results
      .filter(item => item.id && item.redirect_url)
      .map((item) => normalizeJob({
        jobId: `adzuna_${item.id}`,
        source: "Adzuna",
        sourceType: "Major Job API",
        company: item.company?.display_name || "Confidential",
        title: item.title,
        location: item.location?.display_name || "India",
        workMode: "On-site",
        employmentType: item.contract_type || "Full-time",
        description: item.description || "",
        skills: (item.category?.tag ? [item.category.tag] : []),
        minimumExperience: null,
        maximumExperience: null,
        education: "Degree",
        publishedAt: item.created ? new Date(item.created).toISOString() : null,
        applicationUrl: item.redirect_url,
        companyCareersUrl: "",
        salary: item.salary_min ? `₹${item.salary_min} - ₹${item.salary_max}` : "Not Disclosed",
        jobReferenceId: String(item.id)
      }, "Adzuna"))
      .filter(Boolean);
  } catch (err) {
    console.warn(`[Adzuna] Fetch warning for "${what}": ${err.message}`);
    return [];
  }
}

module.exports = { fetchAdzunaJobs };
