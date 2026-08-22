// =====================================================================
// Source Fetcher: Ashby ATS API
// =====================================================================

const { normalizeJob } = require("../pipeline/normalizer");

const ASHBY_COMPANIES = [
  { company: "Linear", board: "linear" },
  { company: "OpenAI", board: "openai" },
  { company: "Ramp", board: "ramp" },
  { company: "Retool", board: "retool" },
  { company: "Vercel", board: "vercel" }
];

async function fetchAshbyJobsForBoard(company, board) {
  try {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${board}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const data = await response.json();
    const jobs = data?.jobs || [];

    return jobs
      .filter((j) => {
        if (!j.id) return false;
        const loc = (j.location || j.secondaryLocations?.map(l => l.location).join(" ") || "").toLowerCase();
        const isIndia = loc.includes("india") || loc.includes("bangalore") || loc.includes("bengaluru") || 
                        loc.includes("hyderabad") || loc.includes("pune") || loc.includes("chennai") ||
                        loc.includes("mumbai") || loc.includes("delhi") || loc.includes("noida") || loc.includes("gurgaon");
        const title = (j.title || "").toLowerCase();
        const isTech = title.includes("software") || title.includes("engineer") || title.includes("developer") || 
                       title.includes("backend") || title.includes("full stack") || title.includes("java");
        return isIndia && isTech;
      })
      .map((j) => {
        return normalizeJob({
          jobId: `ashby_${board}_${j.id}`,
          source: "Ashby",
          sourceType: "Official ATS",
          company,
          title: j.title,
          location: j.location || "India (Remote)",
          workMode: j.isRemote ? "Remote" : "Hybrid",
          employmentType: j.employmentType || "Full-time",
          description: j.descriptionPlain || j.descriptionHtml || "",
          skills: [],
          minimumExperience: null,
          maximumExperience: null,
          education: "B.Tech CSE",
          publishedAt: j.publishedAt || null,
          applicationUrl: j.jobUrl || `https://jobs.ashbyhq.com/${board}/${j.id}`,
          companyCareersUrl: `https://jobs.ashbyhq.com/${board}`,
          salary: "Not Disclosed",
          jobReferenceId: String(j.id)
        }, "Ashby");
      })
      .filter(Boolean);
  } catch (err) {
    return [];
  }
}

async function fetchAllAshbyJobs() {
  const promises = ASHBY_COMPANIES.map(c => fetchAshbyJobsForBoard(c.company, c.board));
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
  fetchAllAshbyJobs,
  fetchAshbyJobsForBoard,
  ASHBY_COMPANIES
};
