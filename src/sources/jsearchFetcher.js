// =====================================================================
// Source Fetcher: JSearch API (via RapidAPI) using native fetch
// =====================================================================

const config = require("../config/env");

async function fetchJSearchJobs(query = "Java Developer fresher India", datePosted = "today") {
  if (!config.rapidApiKey || config.rapidApiKey === "your_rapidapi_key_here") {
    return [];
  }

  try {
    const url = new URL("https://jsearch.p.rapidapi.com/search");
    url.searchParams.set("query", query);
    url.searchParams.set("page", "1");
    url.searchParams.set("num_pages", "1");
    url.searchParams.set("date_posted", datePosted);
    url.searchParams.set("country", "IN");

    const response = await fetch(url.toString(), {
      headers: {
        "x-rapidapi-key": config.rapidApiKey,
        "x-rapidapi-host": "jsearch.p.rapidapi.com"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) return [];
    const resJson = await response.json();
    const data = resJson.data || [];

    return data.map((item) => ({
      jobId: item.job_id,
      source: "JSearch API",
      company: item.employer_name,
      title: item.job_title,
      location: [item.job_city, item.job_state, item.job_country].filter(Boolean).join(", ") || "India",
      workMode: item.job_is_remote ? "Remote" : "On-site",
      employmentType: item.job_employment_type || "Full-time",
      description: item.job_description || "",
      skills: item.job_required_skills || [],
      minimumExperience: item.job_required_experience?.required_experience_in_months
        ? item.job_required_experience.required_experience_in_months / 12
        : null,
      maximumExperience: null,
      education: item.job_required_education?.degree_preferred || "B.Tech / MCA",
      publishedAt: item.job_posted_at_datetime_utc,
      applicationUrl: item.job_apply_link || item.job_google_link,
      companyCareersUrl: item.employer_website,
      salary: item.job_salary || (item.job_min_salary ? `₹${item.job_min_salary} - ₹${item.job_max_salary}` : "Not Disclosed"),
      jobReferenceId: item.job_id
    }));
  } catch (err) {
    console.warn(`[JSearch] Fetch warning for query "${query}": ${err.message}`);
    return [];
  }
}

module.exports = { fetchJSearchJobs };
