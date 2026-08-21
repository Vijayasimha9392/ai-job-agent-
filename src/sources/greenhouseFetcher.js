// =====================================================================
// Source Fetcher: Greenhouse ATS API (100% Verified Active Boards)
// =====================================================================

const { normalizeJob } = require("../pipeline/normalizer");

const GREENHOUSE_COMPANIES = [
  { company: "Razorpay", board: "razorpaysoftwareprivatelimited" },
  { company: "Stripe", board: "stripe" },
  { company: "Postman", board: "postman" },
  { company: "PhonePe", board: "phonepe" },
  { company: "Slice", board: "slice" },
  { company: "Groww", board: "groww" }
];

async function fetchGreenhouseJobsForBoard(company, board) {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const data = await response.json();
    const jobs = data?.jobs || [];

    return jobs
      .filter((j) => {
        const loc = (j.location?.name || "").toLowerCase();
        const isIndia = loc.includes("india") || loc.includes("bangalore") || loc.includes("bengaluru") || 
                        loc.includes("hyderabad") || loc.includes("pune") || loc.includes("remote") ||
                        loc.includes("chennai") || loc.includes("delhi") || loc.includes("noida") || loc.includes("gurgaon");
        const title = (j.title || "").toLowerCase();
        const isTech = title.includes("software") || title.includes("developer") || title.includes("engineer") || 
                       title.includes("java") || title.includes("backend") || title.includes("full stack");
        return isIndia && isTech;
      })
      .map((j) => {
        // Construct canonical direct apply link
        const directUrl = j.absolute_url || `https://job-boards.greenhouse.io/${board}/jobs/${j.id}`;
        return normalizeJob({
          jobId: `gh_${board}_${j.id}`,
          source: "Greenhouse",
          sourceType: "Official ATS",
          company,
          title: j.title,
          location: j.location?.name || "India",
          workMode: (j.location?.name || "").toLowerCase().includes("remote") ? "Remote" : "On-site",
          employmentType: "Full-time",
          description: j.content || "",
          skills: [],
          minimumExperience: null,
          maximumExperience: null,
          education: "B.Tech / B.E. in CSE / IT",
          publishedAt: j.updated_at || new Date().toISOString(),
          applicationUrl: directUrl,
          companyCareersUrl: `https://job-boards.greenhouse.io/${board}`,
          salary: "Not Disclosed",
          jobReferenceId: String(j.id)
        }, "Greenhouse");
      });
  } catch (err) {
    return [];
  }
}

async function fetchAllGreenhouseJobs() {
  const promises = GREENHOUSE_COMPANIES.map(c => fetchGreenhouseJobsForBoard(c.company, c.board));
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
  fetchAllGreenhouseJobs,
  fetchGreenhouseJobsForBoard,
  GREENHOUSE_COMPANIES
};
