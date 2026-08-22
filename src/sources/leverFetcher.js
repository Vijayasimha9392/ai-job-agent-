// =====================================================================
// Source Fetcher: Lever ATS API (100% Verified Active Boards)
// =====================================================================

const { normalizeJob } = require("../pipeline/normalizer");

const LEVER_COMPANIES = [
  { company: "CRED", board: "cred" },
  { company: "Meesho", board: "meesho" },
  { company: "Hotstar", board: "hotstar" },
  { company: "Freshworks", board: "freshworks" }
];

async function fetchLeverJobsForBoard(company, board) {
  try {
    const url = `https://api.lever.co/v0/postings/${board}?mode=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];

    const postings = await response.json();
    if (!Array.isArray(postings)) return [];

    return postings
      .filter((p) => {
        if (!p.id) return false;
        const loc = (p.categories?.location || "").toLowerCase();
        const isIndia = loc.includes("india") || loc.includes("bangalore") || loc.includes("bengaluru") || 
                        loc.includes("hyderabad") || loc.includes("pune") ||
                        loc.includes("chennai") || loc.includes("delhi") || loc.includes("noida") || loc.includes("gurgaon");
        const title = (p.text || "").toLowerCase();
        const isTech = title.includes("software") || title.includes("engineer") || title.includes("developer") || 
                       title.includes("java") || title.includes("backend") || title.includes("full stack");
        return isIndia && isTech;
      })
      .map((p) => {
        const directUrl = p.hostedUrl || `https://jobs.lever.co/${board}/${p.id}`;
        return normalizeJob({
          jobId: `lever_${board}_${p.id}`,
          source: "Lever",
          sourceType: "Official ATS",
          company,
          title: p.text,
          location: p.categories?.location || "India",
          workMode: (p.categories?.workplaceType || "").toLowerCase().includes("remote") ? "Remote" : "On-site",
          employmentType: p.categories?.commitment || "Full-time",
          description: p.descriptionPlain || p.description || "",
          skills: [],
          minimumExperience: null,
          maximumExperience: null,
          education: "B.Tech / B.E. in Computer Science",
          publishedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
          applicationUrl: directUrl,
          companyCareersUrl: `https://jobs.lever.co/${board}`,
          salary: "Not Disclosed",
          jobReferenceId: String(p.id)
        }, "Lever");
      })
      .filter(Boolean);
  } catch (err) {
    return [];
  }
}

async function fetchAllLeverJobs() {
  const promises = LEVER_COMPANIES.map(c => fetchLeverJobsForBoard(c.company, c.board));
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
  fetchAllLeverJobs,
  fetchLeverJobsForBoard,
  LEVER_COMPANIES
};
