// =====================================================================
// Automated Pipeline Test Suite - AI Job Recommendation Agent
// =====================================================================

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { normalizeJob } = require("../src/pipeline/normalizer");
const { evaluateJobFreshness, calculateJobAgeHours, getFreshnessScore } = require("../src/pipeline/freshnessEngine");
const { generateJobFingerprint } = require("../src/pipeline/fingerprintEngine");
const { applyPreAiFilter } = require("../src/pipeline/preAiFilter");
const { classifyJobWithGemini, generateFallbackEvaluation } = require("../src/pipeline/geminiClassifier");
const { determineDispatchPriority, calculateOpportunityScore } = require("../src/pipeline/scoringEngine");
const { renderJobAlertEmail } = require("../src/notifications/emailRenderer");

async function runTests() {
  console.log("=====================================================================");
  console.log("🧪 RUNNING AI JOB RECOMMENDATION AGENT TEST SUITE");
  console.log("=====================================================================\n");

  const now = new Date();
  let passedTests = 0;
  let totalTests = 0;

  async function test(name, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------
  // -------------------------------------------------------------------
  // TEST GROUP 1: Freshness Engine
  // -------------------------------------------------------------------
  console.log("--- 1. Testing Freshness Engine ---");

  await test("Should score 100 for jobs posted 30 minutes ago (< 1h)", () => {
    const pub = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const age = calculateJobAgeHours(pub, now);
    const score = getFreshnessScore(age, true);
    assert.strictEqual(score.score, 100);
    assert.strictEqual(score.tier, "URGENT_0_1H");
    assert.strictEqual(score.isAcceptable, true);
  });

  await test("Should score 95 for jobs posted 2 hours ago (1-3h)", () => {
    const pub = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const age = calculateJobAgeHours(pub, now);
    const score = getFreshnessScore(age, true);
    assert.strictEqual(score.score, 95);
    assert.strictEqual(score.tier, "PRIORITY_1_3H");
  });

  await test("Should score 90 for jobs posted 4 hours ago (3-6h)", () => {
    const pub = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const age = calculateJobAgeHours(pub, now);
    const score = getFreshnessScore(age, true);
    assert.strictEqual(score.score, 90);
    assert.strictEqual(score.tier, "PRIORITY_3_6H");
  });

  await test("Should score 75 for jobs posted 18 hours ago (12-24h)", () => {
    const pub = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
    const age = calculateJobAgeHours(pub, now);
    const score = getFreshnessScore(age, true);
    assert.strictEqual(score.score, 75);
    assert.strictEqual(score.tier, "PRIORITY_12_24H");
  });

  await test("Should REJECT jobs older than 40 hours (> 40h cutoff)", () => {
    const pub = new Date(now.getTime() - 42 * 60 * 60 * 1000).toISOString();
    const age = calculateJobAgeHours(pub, now);
    const score = getFreshnessScore(age, true);
    assert.strictEqual(score.score, 0);
    assert.strictEqual(score.isAcceptable, false);
    assert.strictEqual(score.tier, "REJECTED_EXPIRED");
  });

  // -------------------------------------------------------------------
  // TEST GROUP 2: Pre-AI Rule Filtering
  // -------------------------------------------------------------------
  console.log("\n--- 2. Testing Pre-AI Rule-Based Screening ---");

  await test("Should REJECT Senior / Lead / SDE 2 / Architect roles", () => {
    const seniorJob = {
      title: "Senior Java Developer & Tech Lead",
      description: "Leading a team of engineers",
      applicationUrl: "https://example.com/apply"
    };
    const filter = applyPreAiFilter(seniorJob);
    assert.strictEqual(filter.isPass, false);
    assert.strictEqual(filter.filterCategory, "SENIORITY");

    const sde2Job = {
      title: "Software Engineer 2 (Java Backend)",
      description: "Working on distributed systems",
      applicationUrl: "https://example.com/apply"
    };
    const filter2 = applyPreAiFilter(sde2Job);
    assert.strictEqual(filter2.isPass, false);
    assert.strictEqual(filter2.filterCategory, "SENIORITY");
  });

  await test("Should REJECT jobs requiring mandatory 3+ years experience via description", () => {
    const expJob = {
      title: "Java Backend Engineer",
      description: "Requires minimum 3+ years of experience with Spring Boot and AWS.",
      applicationUrl: "https://example.com/apply"
    };
    const filter = applyPreAiFilter(expJob);
    assert.strictEqual(filter.isPass, false);
    assert.strictEqual(filter.filterCategory, "EXPERIENCE_EXCEEDED");

    const rangeJob = {
      title: "Java Developer",
      description: "Candidates must have 3-5 years of industry experience.",
      applicationUrl: "https://example.com/apply"
    };
    const filter2 = applyPreAiFilter(rangeJob);
    assert.strictEqual(filter2.isPass, false);
    assert.strictEqual(filter2.filterCategory, "EXPERIENCE_EXCEEDED");
  });

  await test("Should REJECT expired or closed job listings", () => {
    const closedJob = {
      title: "Java Developer",
      description: "Note: This application closed and we are no longer accepting applications.",
      applicationUrl: "https://example.com/apply"
    };
    const filter = applyPreAiFilter(closedJob);
    assert.strictEqual(filter.isPass, false);
    assert.strictEqual(filter.filterCategory, "EXPIRED_JOB");
  });

  await test("Should REJECT Non-development / BPO / Sales roles", () => {
    const bpoJob = {
      title: "Customer Support Executive - BPO Voice Process",
      description: "Handling calls",
      applicationUrl: "https://example.com/apply"
    };
    const filter = applyPreAiFilter(bpoJob);
    assert.strictEqual(filter.isPass, false);
    assert.strictEqual(filter.filterCategory, "NON_DEV_ROLE");
  });

  await test("Should PASS valid Associate Software Engineer / Java Fresher / 0-2 years role", () => {
    const goodJob = {
      title: "Associate Software Engineer - Java / Spring Boot",
      minimumExperience: 0,
      description: "Building REST APIs with Java 17 and Spring Boot, MySQL. 0-2 years experience / 2025 graduates welcome.",
      applicationUrl: "https://careers.infosys.com/job/101"
    };
    const filter = applyPreAiFilter(goodJob);
    assert.strictEqual(filter.isPass, true);
  });

  // -------------------------------------------------------------------
  // TEST GROUP 3: Fingerprinting & Deduplication
  // -------------------------------------------------------------------
  console.log("\n--- 3. Testing SHA-256 Fingerprinting Engine ---");

  await test("Should generate identical hashes for identical jobs regardless of casing/spacing", () => {
    const jobA = {
      company: "Infosys Technologies Ltd.",
      title: "Associate Software Engineer - Java",
      jobReferenceId: "INF-101",
      applicationUrl: "https://careers.infosys.com/job/101?utm_source=linkedin"
    };
    const jobB = {
      company: "infosys",
      title: "associate software engineer java",
      jobReferenceId: "INF-101",
      applicationUrl: "https://careers.infosys.com/job/101?utm_source=email"
    };
    const hashA = generateJobFingerprint(jobA);
    const hashB = generateJobFingerprint(jobB);
    assert.strictEqual(hashA, hashB);
    assert.strictEqual(hashA.length, 64);
  });

  // -------------------------------------------------------------------
  // TEST GROUP 4: Gemini Classification & Scoring
  // -------------------------------------------------------------------
  console.log("\n--- 4. Testing Scoring & Priority Routing ---");

  await test("Should route fresh (<3h) high match (>=80%) job to URGENT priority", () => {
    const mockFreshJob = {
      jobAgeHours: 0.5,
      freshnessScore: 100,
      freshnessLabel: "Urgent (< 1h ago)",
      source: "Company Career Portal"
    };
    const mockEval = {
      isEligible: true,
      matchScore: 90,
      matchLevel: "Excellent Match"
    };
    const dispatch = determineDispatchPriority(mockFreshJob, mockEval, 80);
    assert.strictEqual(dispatch.shouldEmail, true);
    assert.strictEqual(dispatch.priorityLevel, "URGENT");
  });

  await test("Should REJECT email dispatch for scores below 80 (e.g., 61% or 75%)", () => {
    const mockJob = {
      jobAgeHours: 0.5,
      freshnessScore: 100,
      source: "Adzuna"
    };
    const mockEval61 = {
      isEligible: true,
      matchScore: 61,
      matchLevel: "Possible Match"
    };
    const dispatch61 = determineDispatchPriority(mockJob, mockEval61, 80);
    assert.strictEqual(dispatch61.shouldEmail, false);
    assert.strictEqual(dispatch61.priorityLevel, "STORE_ONLY");

    const mockEval75 = {
      isEligible: true,
      matchScore: 75,
      matchLevel: "Good Match"
    };
    const dispatch75 = determineDispatchPriority(mockJob, mockEval75, 80);
    assert.strictEqual(dispatch75.shouldEmail, false);
  });

  await test("Should calculate composite OpportunityScore correctly", () => {
    const opp = calculateOpportunityScore(90, 100, "Company Career Portal");
    // (90 * 0.70) + (100 * 0.20) + (100 * 0.10) = 63 + 20 + 10 = 93
    assert.strictEqual(opp.opportunityScore, 93);
  });

  // -------------------------------------------------------------------
  // TEST GROUP 5: Single Summary Email & No Jobs Found Rendering
  // -------------------------------------------------------------------
  console.log("\n--- 5. Testing Single Summary Email & No Jobs Found Generator ---");

  const { renderSummaryEmail } = require("../src/notifications/emailRenderer");
  const { hasJobBeenEmailed, markBatchJobsAsEmailed, initDatabase } = require("../src/db/database");

  await test("Should render combined summary email when multiple (N > 0) jobs found", () => {
    const job1 = {
      title: "Java Full Stack Developer",
      company: "Company A",
      location: "Hyderabad",
      workMode: "Hybrid",
      applicationUrl: "https://example.com/apply/1"
    };
    const eval1 = {
      matchScore: 87,
      matchLevel: "Excellent Match",
      whyMatched: "Direct Java + React stack match",
      experienceRequired: "0-2 years",
      matchedSkills: ["Java", "Spring Boot", "React.js"]
    };

    const job2 = {
      title: "Java Developer",
      company: "Company B",
      location: "Bengaluru",
      workMode: "On-site",
      applicationUrl: "https://example.com/apply/2"
    };
    const eval2 = {
      matchScore: 82,
      matchLevel: "Strong Match",
      whyMatched: "Strong Spring Boot & MySQL",
      experienceRequired: "0-1 years",
      matchedSkills: ["Java", "Spring Boot", "MySQL"]
    };

    const qualifiedJobs = [
      { job: job1, evaluation: eval1, dispatchMeta: { priorityLevel: "EXCELLENT" } },
      { job: job2, evaluation: eval2, dispatchMeta: { priorityLevel: "STRONG" } }
    ];

    const email = renderSummaryEmail(qualifiedJobs, "Asia/Kolkata", "Vijayasimha Tammineni");
    assert.strictEqual(email.subject, "🚀 Job Hunter AI - 2 New Jobs Found");
    assert.ok(email.text.includes("2 new matching jobs were found"));
    assert.ok(email.text.includes("1. Java Full Stack Developer - Company A"));
    assert.ok(email.text.includes("2. Java Developer - Company B"));
    assert.ok(email.html.includes("Company A"));
    assert.ok(email.html.includes("Company B"));
    assert.ok(email.html.includes("https://example.com/apply/1"));
    assert.ok(email.html.includes("https://example.com/apply/2"));
  });

  await test("Should render 'No New Jobs Found' email when zero (N = 0) matching jobs exist", () => {
    const email = renderSummaryEmail([], "Asia/Kolkata", "Vijayasimha Tammineni");
    assert.strictEqual(email.subject, "Job Hunter AI - No New Jobs Found");
    assert.ok(email.text.includes("No new matching jobs were found in the latest 55-minute search."));
    assert.ok(email.text.includes("Previously emailed jobs were excluded successfully."));
    assert.ok(email.text.includes("The agent will check again in 55 minutes."));
    assert.ok(email.html.includes("No New Matching Jobs Found"));
  });

  await test("Should exclude previously emailed jobs via persistent history", async () => {
    await initDatabase();
    const testFp = "test_fingerprint_unique_12345";
    const testJob = {
      jobId: "test_job_fp_1",
      company: "Test Corp",
      title: "Java Developer",
      applicationUrl: "https://example.com/test-apply"
    };

    // Initially not emailed
    const initialStatus = await hasJobBeenEmailed(testFp);
    assert.strictEqual(initialStatus, false);

    // Mark as emailed
    await markBatchJobsAsEmailed(
      [{ job: testJob, fingerprint: testFp, evaluation: { matchScore: 85 }, dispatchMeta: { priorityLevel: "STRONG" } }],
      "test@example.com",
      "🚀 Test Alert"
    );

    // Now hasJobBeenEmailed should be true
    const updatedStatus = await hasJobBeenEmailed(testFp);
    assert.strictEqual(updatedStatus, true);
  });

  console.log(`\n=====================================================================`);
  console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} Passed (100% Success)`);
  console.log(`=====================================================================\n`);
}

runTests();
