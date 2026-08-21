// =====================================================================
// Source Fetcher: Arbeitnow Public Job Board API using native fetch
// =====================================================================

async function fetchArbeitnowJobs() {
  try {
    const response = await fetch("https://www.arbeitnow.com/api/job-board-api", {
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) return [];
    const json = await response.json();
    const jobs = json?.data || [];

    return jobs
      .filter((j) => {
        const text = `${j.title} ${j.description} ${(j.tags || []).join(" ")}`.toLowerCase();
        return text.includes("java") || text.includes("software") || text.includes("backend") || text.includes("full stack");
      })
      .map((j) => ({
        jobId: `arbeit_${j.slug}`,
        source: "Arbeitnow",
        company: j.company_name,
        title: j.title,
        location: j.location || "Remote",
        workMode: j.remote ? "Remote" : "On-site",
        employmentType: Array.isArray(j.job_types) ? j.job_types.join(", ") : "Full-time",
        description: j.description || "",
        skills: Array.isArray(j.tags) ? j.tags : [],
        minimumExperience: null,
        maximumExperience: null,
        education: "B.Tech / Degree",
        publishedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
        applicationUrl: j.url,
        companyCareersUrl: "",
        salary: "Not Disclosed",
        jobReferenceId: j.slug
      }));
  } catch (err) {
    console.warn(`[Arbeitnow] Fetch warning: ${err.message}`);
    return [];
  }
}

module.exports = { fetchArbeitnowJobs };
