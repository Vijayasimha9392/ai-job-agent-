// =====================================================================
// Source Fetcher: Remotive Remote Developer Jobs API using native fetch
// =====================================================================

async function fetchRemotiveJobs() {
  try {
    const response = await fetch("https://remotive.com/api/remote-jobs?category=software-dev", {
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) return [];
    const json = await response.json();
    const jobs = json?.jobs || [];

    return jobs
      .filter((j) => {
        const text = `${j.title} ${j.description} ${(j.tags || []).join(" ")}`.toLowerCase();
        const isIndiaEligible = !j.candidate_required_location || 
          j.candidate_required_location.toLowerCase().includes("worldwide") || 
          j.candidate_required_location.toLowerCase().includes("anywhere") || 
          j.candidate_required_location.toLowerCase().includes("india") || 
          j.candidate_required_location.toLowerCase().includes("apac");
        
        return isIndiaEligible && (text.includes("java") || text.includes("backend") || text.includes("spring") || text.includes("software"));
      })
      .map((j) => ({
        jobId: `remotive_${j.id}`,
        source: "Remotive",
        company: j.company_name,
        title: j.title,
        location: j.candidate_required_location || "Remote (Worldwide / India)",
        workMode: "Remote",
        employmentType: j.job_type || "Full-time",
        description: j.description || "",
        skills: j.tags || [],
        minimumExperience: null,
        maximumExperience: null,
        education: "B.Tech / Equivalent",
        publishedAt: j.publication_date ? new Date(j.publication_date).toISOString() : new Date().toISOString(),
        applicationUrl: j.url,
        companyCareersUrl: j.company_logo_url || "",
        salary: j.salary || "Not Disclosed",
        jobReferenceId: String(j.id)
      }));
  } catch (err) {
    console.warn(`[Remotive] Fetch warning: ${err.message}`);
    return [];
  }
}

module.exports = { fetchRemotiveJobs };
