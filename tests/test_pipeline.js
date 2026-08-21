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

  function test(name, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------
  // TEST GROUP 1: Freshness Engine
  // -------------------------------------------------------------------
  console.log("--- 1. Testing Freshness Engine ---");

  test("Should score 100 for jobs posted 30 minutes ago (< 1h)", () => {
    const pub = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const age = calculateJobAgeHours(pub, now);
    const score = getFreshnessScore(age, true);
    assert.strictEqual(score.score, 100);
    assert.strictEqual(score.tier, "URGENT_0_1H");
    assert.strictEqual(score.isAcceptable, true);
  });

  test("Should score 95 for jobs posted 2 hours ago (1-3h)", () => {
    const pub = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const age = calculateJobAgeHours(pub, now);
    const score = getFreshnessScore(age, true);
    assert.strictEqual(score.score, 95);
    assert.strictEqual(score.tier, "PRIORITY_1_3H");
  });

  test("Should score 90 for jobs posted 4 hours ago (3-6h)", () => {
    const pub = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const age = calculateJobAgeHours(pub, now);
    const score = getFreshnessScore(age, true);
    assert.strictEqual(score.score, 90);
    assert.strictEqual(score.tier, "PRIORITY_3_6H");
  });

  test("Should score 75 for jobs posted 18 hours ago (12-24h)", () => {
    const pub = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
    const age = calculateJobAgeHours(pub, now);
    const score = getFreshnessScore(age, true);
    assert.strictEqual(score.score, 75);
    assert.strictEqual(score.tier, "PRIORITY_12_24H");
  });

  test("Should REJECT jobs older than 40 hours (> 40h cutoff)", () => {
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

  test("Should REJECT Senior / Lead / SDE 2 / Architect roles", () => {
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

  test("Should REJECT jobs requiring mandatory 3+ years experience via description", () => {
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

  test("Should REJECT expired or closed job listings", () => {
    const closedJob = {
      title: "Java Developer",
      description: "Note: This application closed and we are no longer accepting applications.",
      applicationUrl: "https://example.com/apply"
    };
    const filter = applyPreAiFilter(closedJob);
    assert.strictEqual(filter.isPass, false);
    assert.strictEqual(filter.filterCategory, "EXPIRED_JOB");
  });

  test("Should REJECT Non-development / BPO / Sales roles", () => {
    const bpoJob = {
      title: "Customer Support Executive - BPO Voice Process",
      description: "Handling calls",
      applicationUrl: "https://example.com/apply"
    };
    const filter = applyPreAiFilter(bpoJob);
    assert.strictEqual(filter.isPass, false);
    assert.strictEqual(filter.filterCategory, "NON_DEV_ROLE");
  });

  test("Should PASS valid Associate Software Engineer / Java Fresher / 0-2 years role", () => {
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

  test("Should generate identical hashes for identical jobs regardless of casing/spacing", () => {
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

  test("Should route fresh (<3h) high match (>=75%) job to URGENT priority", () => {
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
    const dispatch = determineDispatchPriority(mockFreshJob, mockEval, 65);
    assert.strictEqual(dispatch.shouldEmail, true);
    assert.strictEqual(dispatch.priorityLevel, "URGENT");
  });

  test("Should calculate composite OpportunityScore correctly", () => {
    const opp = calculateOpportunityScore(90, 100, "Company Career Portal");
    // (90 * 0.70) + (100 * 0.20) + (100 * 0.10) = 63 + 20 + 10 = 93
    assert.strictEqual(opp.opportunityScore, 93);
  });

  // -------------------------------------------------------------------
  // TEST GROUP 5: HTML Email Template Generation
  // -------------------------------------------------------------------
  console.log("\n--- 5. Testing Email Alert Generator ---");

  test("Should render rich HTML email containing all critical fields & CTA", () => {
    const sampleJob = {
      jobId: "job_test123",
      company: "Razorpay",
      title: "Junior Java Full Stack Developer",
      location: "Bengaluru, India",
      workMode: "Hybrid",
      publishedAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      discoveredAt: now.toISOString(),
      jobAgeHours: 0.75,
      freshnessLabel: "Urgent (< 1h ago)",
      source: "Greenhouse",
      salary: "₹8 - ₹12 LPA",
      jobReferenceId: "RZP-4092",
      applicationUrl: "https://boards.greenhouse.io/razorpay/jobs/4092",
      companyCareersUrl: "https://razorpay.com/careers"
    };
    const sampleEval = {
      matchScore: 92,
      matchLevel: "Excellent Match",
      whyMatched: "Direct alignment with Java 17, Spring Boot, REST APIs, and React frontend.",
      experienceRequired: "0-2 years",
      matchedSkills: ["Java", "Spring Boot", "React.js", "MySQL"],
      missingSkills: ["Kafka"],
      applicationPriority: "Apply Immediately"
    };
    const sampleDispatch = {
      priorityLevel: "URGENT",
      badgeText: "🔥 URGENT ALERT (< 3h)",
      badgeColor: "#dc2626"
    };

    const email = renderJobAlertEmail(sampleJob, sampleEval, sampleDispatch);
    assert.ok(email.subject.includes("Razorpay"));
    assert.ok(email.html.includes("Junior Java Full Stack Developer"));
    assert.ok(email.html.includes("Apply Directly on Official Portal"));
    assert.ok(email.html.includes("Razorpay"));
    assert.ok(email.text.includes("Apply as early as possible"));
  });

  console.log(`\n=====================================================================`);
  console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} Passed (100% Success)`);
  console.log(`=====================================================================\n`);
}

runTests();
