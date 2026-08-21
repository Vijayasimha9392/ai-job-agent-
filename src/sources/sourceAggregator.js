// =====================================================================
// Multi-Source Job Aggregator - Fault-tolerant concurrent ingestor
// =====================================================================

const candidateProfile = require("../config/candidateProfile");
const { fetchJSearchJobs } = require("./jsearchFetcher");
const { fetchArbeitnowJobs } = require("./arbeitnowFetcher");
const { fetchRemotiveJobs } = require("./remotiveFetcher");
const { fetchAdzunaJobs } = require("./adzunaFetcher");
const { fetchDirectAtsJobs } = require("./atsFeedsFetcher");

/**
 * Executes concurrent queries across all supported sources
 * @param {Array<string>} [queries]
 * @returns {Promise<Array>} List of raw job objects
 */
async function aggregateJobsFromAllSources(queries = candidateProfile.searchQueries.slice(0, 4)) {
  console.log(`🌐 [Aggregator] Initiating multi-source ingestion across ${queries.length} query variations...`);

  const tasks = [];

  // 1. JSearch queries
  for (const q of queries) {
    tasks.push(
      fetchJSearchJobs(q, "today").catch((err) => {
        console.warn(`[Aggregator] JSearch "${q}" warning:`, err.message);
        return [];
      })
    );
  }

  // 2. Adzuna queries (India tech ecosystem)
  const adzunaQueries = [
    "Java Developer",
    "Associate Software Engineer",
    "Java Spring Boot",
    "Java Backend",
    "Full Stack Developer Java",
    "Software Engineer Fresher"
  ];
  for (const aq of adzunaQueries) {
    tasks.push(
      fetchAdzunaJobs(aq).catch((err) => {
        console.warn(`[Aggregator] Adzuna "${aq}" warning:`, err.message);
        return [];
      })
    );
  }

  // 3. Arbeitnow
  tasks.push(
    fetchArbeitnowJobs().catch((err) => {
      console.warn("[Aggregator] Arbeitnow warning:", err.message);
      return [];
    })
  );

  // 4. Remotive
  tasks.push(
    fetchRemotiveJobs().catch((err) => {
      console.warn("[Aggregator] Remotive warning:", err.message);
      return [];
    })
  );

  // 5. Direct ATS Feeds
  tasks.push(
    fetchDirectAtsJobs().catch((err) => {
      console.warn("[Aggregator] Direct ATS warning:", err.message);
      return [];
    })
  );

  const results = await Promise.allSettled(tasks);
  const aggregated = [];

  for (const res of results) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      aggregated.push(...res.value);
    }
  }

  console.log(`✅ [Aggregator] Ingested ${aggregated.length} raw listings across all sources.`);
  return aggregated;
}

module.exports = { aggregateJobsFromAllSources };
