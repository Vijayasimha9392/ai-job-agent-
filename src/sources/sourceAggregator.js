// =====================================================================
// Source Aggregator - Multi-Tier Concurrent Ingestion Engine
// =====================================================================

const { fetchAllGreenhouseJobs } = require("./greenhouseFetcher");
const { fetchAllLeverJobs } = require("./leverFetcher");
const { fetchAllAshbyJobs } = require("./ashbyFetcher");
const { fetchAllSmartRecruitersJobs } = require("./smartRecruitersFetcher");
const { fetchAllWorkdayJobs } = require("./workdayFetcher");
const { fetchAdzunaJobs } = require("./adzunaFetcher");
const { fetchJSearchJobs } = require("./jsearchFetcher");
const { fetchArbeitnowJobs } = require("./arbeitnowFetcher");
const { fetchRemotiveJobs } = require("./remotiveFetcher");
const { updateSourceState } = require("../db/database");

/**
 * Executes Fast Tier Sources (Poll interval: 2 minutes)
 * - JSearch API
 * - Adzuna API
 * - Greenhouse career pages
 * - Lever career pages
 * - SmartRecruiters career pages
 * - Ashby career pages
 */
async function fetchFastTierSources(queryVariations = ["Java Developer India", "Spring Boot React Developer"]) {
  console.log("⚡ [Aggregator] Ingesting FAST Tier sources (2m cadence)...");
  const startTime = Date.now();

  const promises = [
    fetchAllGreenhouseJobs().then(jobs => { updateSourceState("Greenhouse", "FAST", jobs.length); return jobs; }),
    fetchAllLeverJobs().then(jobs => { updateSourceState("Lever", "FAST", jobs.length); return jobs; }),
    fetchAllAshbyJobs().then(jobs => { updateSourceState("Ashby", "FAST", jobs.length); return jobs; }),
    fetchAllSmartRecruitersJobs().then(jobs => { updateSourceState("SmartRecruiters", "FAST", jobs.length); return jobs; }),
    ...queryVariations.slice(0, 3).map(q => fetchAdzunaJobs(q).then(jobs => { updateSourceState("Adzuna", "FAST", jobs.length); return jobs; })),
    ...queryVariations.slice(0, 2).map(q => fetchJSearchJobs(q).then(jobs => { updateSourceState("JSearch", "FAST", jobs.length); return jobs; }))
  ];

  const results = await Promise.allSettled(promises);
  const jobs = [];

  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      jobs.push(...r.value);
    } else if (r.status === "rejected") {
      console.warn("⚠️ [Fast Tier] Source task error:", r.reason?.message || r.reason);
    }
  }

  console.log(`✅ [Fast Tier] Ingested ${jobs.length} raw jobs in ${Date.now() - startTime}ms`);
  return jobs;
}

/**
 * Executes Normal Tier Sources (Poll interval: 5 minutes)
 * - Workday public career pages
 * - SuccessFactors public career pages
 * - Arbeitnow & Remotive feeds
 */
async function fetchNormalTierSources() {
  console.log("🌐 [Aggregator] Ingesting NORMAL Tier sources (India career feeds)...");
  const startTime = Date.now();

  const promises = [
    fetchAllWorkdayJobs().then(jobs => { updateSourceState("Workday", "NORMAL", jobs.length); return jobs; })
  ];

  const results = await Promise.allSettled(promises);
  const jobs = [];

  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      jobs.push(...r.value);
    } else if (r.status === "rejected") {
      console.warn("⚠️ [Normal Tier] Source task error:", r.reason?.message || r.reason);
    }
  }

  console.log(`✅ [Normal Tier] Ingested ${jobs.length} raw jobs in ${Date.now() - startTime}ms`);
  return jobs;
}

/**
 * Executes All Sources Concurrently
 */
async function fetchAllSources(queryVariations = []) {
  console.log("🌐 [Aggregator] Initiating full multi-source ingestion...");
  const [fastJobs, normalJobs] = await Promise.all([
    fetchFastTierSources(queryVariations),
    fetchNormalTierSources()
  ]);

  return [...fastJobs, ...normalJobs];
}

module.exports = {
  fetchFastTierSources,
  fetchNormalTierSources,
  fetchAllSources
};
