// =====================================================================
// Source Fetcher: Workday Public Career Feeds (Tier: Normal - 5 min)
// =====================================================================

const { normalizeJob } = require("../pipeline/normalizer");

const WORKDAY_ENDPOINTS = [
  { company: "Walmart Global Tech", domain: "walmart.wd5.myworkdayjobs.com", path: "WalmartExternal" },
  { company: "Target", domain: "target.wd5.myworkdayjobs.com", path: "targetcareers" },
  { company: "Adobe", domain: "adobe.wd5.myworkdayjobs.com", path: "external_experienced" }
];

async function fetchWorkdayJobs(company, domain, path) {
  try {
    const url = `https://${domain}/wday/cxs/${company.toLowerCase().replace(/\s+/g, "")}/${path}/jobs`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appliedFacets: { locationCountry: ["bc33aa3152ec42d4995f4791a106ed09"] }, // India Country Code
        limit: 20,
        offset: 0,
        searchText: "Java Software Engineer"
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) return [];
    const data = await response.json();
    const jobPostings = data?.jobPostings || [];

    return jobPostings.map(j => {
      const externalPath = j.externalPath || `job/${j.bulletFields?.[0] || ""}`;
      return normalizeJob({
        jobId: `wd_${j.bulletFields?.[0] || Math.random().toString(36).substring(7)}`,
        source: "Workday",
        sourceType: "Official ATS",
        company,
        title: j.title,
        location: j.locationsText || "India",
        workMode: "Hybrid",
        employmentType: j.timeType || "Full-time",
        description: j.title + " (Direct Workday Job Posting)",
        skills: ["Java", "Spring Boot", "REST APIs"],
        minimumExperience: null,
        maximumExperience: null,
        education: "B.Tech CSE",
        publishedAt: j.postedOn ? new Date().toISOString() : new Date().toISOString(),
        applicationUrl: `https://${domain}/en-US/${path}${externalPath}`,
        companyCareersUrl: `https://${domain}/`,
        salary: "Competitive",
        jobReferenceId: String(j.bulletFields?.[0] || "")
      }, "Workday");
    });
  } catch (err) {
    return [];
  }
}

async function fetchAllWorkdayJobs() {
  const promises = WORKDAY_ENDPOINTS.map(w => fetchWorkdayJobs(w.company, w.domain, w.path));
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
  fetchAllWorkdayJobs,
  fetchWorkdayJobs,
  WORKDAY_ENDPOINTS
};
