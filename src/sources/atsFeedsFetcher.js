// =====================================================================
// Source Fetcher: Direct ATS Feeds (Expanded Indian Tech Ecosystem)
// =====================================================================

const MONITORED_ATS_COMPANIES = [
  { company: "Uber", platform: "greenhouse", board: "uber" },
  { company: "Stripe", platform: "greenhouse", board: "stripe" },
  { company: "Razorpay", platform: "greenhouse", board: "razorpaysoftwareprivatelimited" },
  { company: "Postman", platform: "greenhouse", board: "postman" },
  { company: "PhonePe", platform: "greenhouse", board: "phonepe" },
  { company: "Swiggy", platform: "lever", board: "swiggy" },
  { company: "Cred", platform: "lever", board: "cred" },
  { company: "Meesho", platform: "lever", board: "meesho" },
  { company: "Groww", platform: "lever", board: "groww" },
  { company: "Urban Company", platform: "lever", board: "urbancompany" },
  { company: "BrowserStack", platform: "lever", board: "browserstack" },
  { company: "CleverTap", platform: "lever", board: "clevertap" },
  { company: "Slice", platform: "greenhouse", board: "slice" },
  { company: "Juspay", platform: "lever", board: "juspay" },
  { company: "CoinSwitch", platform: "lever", board: "coinswitch" }
];

async function fetchGreenhouseJobs(company, board) {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
      .map((j) => ({
        jobId: `gh_${board}_${j.id}`,
        source: "Greenhouse",
        company,
        title: j.title,
        location: j.location?.name || "India",
        workMode: (j.location?.name || "").toLowerCase().includes("remote") ? "Remote" : "On-site",
        employmentType: "Full-time",
        description: j.content || "",
        skills: [],
        minimumExperience: null,
        maximumExperience: null,
        education: "B.Tech / B.E.",
        publishedAt: j.updated_at || new Date().toISOString(),
        applicationUrl: j.absolute_url,
        companyCareersUrl: `https://boards.greenhouse.io/${board}`,
        salary: "Not Disclosed",
        jobReferenceId: String(j.id)
      }));
  } catch (err) {
    return [];
  }
}

async function fetchLeverJobs(company, board) {
  try {
    const url = `https://api.lever.co/v0/postings/${board}?mode=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const postings = await response.json();

    return postings
      .filter((p) => {
        const loc = (p.categories?.location || "").toLowerCase();
        const isIndia = loc.includes("india") || loc.includes("bangalore") || loc.includes("bengaluru") || 
                        loc.includes("hyderabad") || loc.includes("pune") || loc.includes("remote") ||
                        loc.includes("chennai") || loc.includes("delhi") || loc.includes("noida") || loc.includes("gurgaon");
        const title = (p.text || "").toLowerCase();
        return isIndia && (title.includes("software") || title.includes("engineer") || title.includes("developer") || 
                           title.includes("java") || title.includes("backend") || title.includes("full stack"));
      })
      .map((p) => ({
        jobId: `lever_${board}_${p.id}`,
        source: "Lever",
        company,
        title: p.text,
        location: p.categories?.location || "India",
        workMode: (p.categories?.workplaceType || "").toLowerCase().includes("remote") ? "Remote" : "On-site",
        employmentType: p.categories?.commitment || "Full-time",
        description: p.descriptionPlain || p.description || "",
        skills: [],
        minimumExperience: null,
        maximumExperience: null,
        education: "B.Tech / B.E.",
        publishedAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
        applicationUrl: p.applyUrl || p.hostedUrl,
        companyCareersUrl: `https://jobs.lever.co/${board}`,
        salary: "Not Disclosed",
        jobReferenceId: String(p.id)
      }));
  } catch (err) {
    return [];
  }
}

async function fetchDirectAtsJobs() {
  const allPromises = MONITORED_ATS_COMPANIES.map(async (target) => {
    if (target.platform === "greenhouse") {
      return fetchGreenhouseJobs(target.company, target.board);
    } else if (target.platform === "lever") {
      return fetchLeverJobs(target.company, target.board);
    }
    return [];
  });

  const results = await Promise.allSettled(allPromises);
  const flattened = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      flattened.push(...r.value);
    }
  }
  return flattened;
}

module.exports = {
  fetchDirectAtsJobs,
  fetchGreenhouseJobs,
  fetchLeverJobs,
  MONITORED_ATS_COMPANIES
};
