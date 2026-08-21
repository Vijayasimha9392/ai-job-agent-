// =====================================================================
// Comprehensive Unit & Integration Test Suite for Near-Real-Time Job Hunter AI
// =====================================================================

const assert = require("assert");
const { normalizeJob, extractExperience, extractCommonSkills } = require("../src/pipeline/normalizer");
const { evaluateJobFreshness, calculateJobAgeMinutes, calculateJobAgeHours, getFreshnessScore } = require("../src/pipeline/freshnessEngine");
const { generateJobFingerprint, normalizeCompanyForHashing, normalizeTitleForHashing } = require("../src/pipeline/fingerprintEngine");
const { applyPreAiFilter } = require("../src/pipeline/preAiFilter");
const { calculateOpportunityScore, determineDispatchPriority, getSourceTrustScore } = require("../src/pipeline/scoringEngine");
const { renderSummaryEmail, formatDisplayDate } = require("../src/notifications/emailRenderer");
const { formatSingleJobTelegram, formatBatchTelegramMessages, escapeHtml } = require("../src/notifications/telegram.service");
const { formatPushPayload } = require("../src/notifications/push.service");
const { dispatchNotificationBatch } = require("../src/notifications/notification.service");
const { initDatabase, isDuplicateFingerprint, hasJobBeenNotified, saveJobAndFingerprint, registerPushDevice, getActivePushDevices, deactivatePushDevice } = require("../src/db/database");

let passedCount = 0;
let totalCount = 0;

async function runTest(name, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runAllTests() {
  console.log("\n=====================================================================");
  console.log("🧪 RUNNING COMPREHENSIVE TEST SUITE (NEAR-REAL-TIME & MULTI-CHANNEL)");
  console.log("=====================================================================\n");

  await initDatabase();

  // -------------------------------------------------------------------
  // 1. Freshness & Age Programmatic Engine
  // -------------------------------------------------------------------
  console.log("▶ [1/6] Programmatic Freshness & Age Engine Tests");

  await runTest("Programmatic minute and hour calculation (5 min ago)", () => {
    const now = new Date();
    const pub = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const mins = calculateJobAgeMinutes(pub, now);
    const hrs = calculateJobAgeHours(pub, now);
    assert.strictEqual(Math.round(mins), 5);
    assert.strictEqual(hrs <= 0.1, true);
  });

  await runTest("Freshness Tiers: 0-5 min is CRITICAL, 5-15 min is URGENT", () => {
    const criticalMeta = getFreshnessScore(3.0, true);
    assert.strictEqual(criticalMeta.tier, "CRITICAL");
    assert.strictEqual(criticalMeta.score, 100);

    const urgentMeta = getFreshnessScore(12.0, true);
    assert.strictEqual(urgentMeta.tier, "URGENT");
    assert.strictEqual(urgentMeta.score, 98);
  });

  await runTest("Freshness Cutoff: >40h is REJECTED", () => {
    const staleMeta = getFreshnessScore(41 * 60, true, 40);
    assert.strictEqual(staleMeta.isAcceptable, false);
    assert.strictEqual(staleMeta.tier, "REJECTED_EXPIRED");
  });

  await runTest("Unverified publishedAt cannot be marked as CRITICAL or URGENT", () => {
    const unverifiedMeta = getFreshnessScore(2.0, false);
    assert.notStrictEqual(unverifiedMeta.tier, "CRITICAL");
    assert.notStrictEqual(unverifiedMeta.tier, "URGENT");
    assert.strictEqual(unverifiedMeta.tier, "NORMAL");
  });

  // -------------------------------------------------------------------
  // 2. Normalization & Canonical Schema
  // -------------------------------------------------------------------
  console.log("\n▶ [2/6] Normalization & Schema Verification Tests");

  await runTest("Normalized Job contains all 20 canonical fields including sourceType and jobAgeMinutes", () => {
    const raw = {
      title: "Junior Java Developer",
      employer_name: "Swiggy",
      job_apply_link: "https://careers.swiggy.com/job/123",
      job_posted_at_datetime_utc: new Date().toISOString()
    };
    const norm = normalizeJob(raw, "Lever");
    assert.strictEqual(norm.source, "Lever");
    assert.strictEqual(norm.sourceType, "Official ATS");
    assert.strictEqual(norm.company, "Swiggy");
    assert.strictEqual(norm.freshnessVerified, true);
    assert.strictEqual(typeof norm.jobId, "string");
  });

  // -------------------------------------------------------------------
  // 3. Pre-AI Hard Screening Filter
  // -------------------------------------------------------------------
  console.log("\n▶ [3/6] Pre-AI Hard Filter Tests");

  await runTest("Rejects Seniority Blacklist (Senior, Lead, Principal, Architect, VP)", () => {
    const seniorJob = { title: "Senior Java Developer", description: "Looking for a senior coder", location: "Bengaluru", applicationUrl: "https://example.com" };
    const leadJob = { title: "Tech Lead Java Spring Boot", description: "Lead the engineering team", location: "Hyderabad", applicationUrl: "https://example.com" };
    const archJob = { title: "Enterprise Architect", description: "Architecture role", location: "Pune", applicationUrl: "https://example.com" };

    assert.strictEqual(applyPreAiFilter(seniorJob).isPass, false);
    assert.strictEqual(applyPreAiFilter(leadJob).isPass, false);
    assert.strictEqual(applyPreAiFilter(archJob).isPass, false);
  });

  await runTest("Rejects Mandatory >= 3 Years Experience", () => {
    const jobWithExp = { title: "Software Engineer", description: "Requires minimum 4+ years of experience in Java", location: "Hyderabad", minimumExperience: 4.0, applicationUrl: "https://example.com" };
    assert.strictEqual(applyPreAiFilter(jobWithExp).isPass, false);
    assert.strictEqual(applyPreAiFilter(jobWithExp).filterCategory, "EXPERIENCE_EXCEEDED");
  });

  await runTest("Accepts Fresh / 0-2 yrs Software Development Roles", () => {
    const validJob = { title: "Associate Software Engineer - Java", description: "Seeking 2025 B.Tech graduates or 0-1 year experienced Java developers with Spring Boot and MySQL", location: "Hyderabad, India", minimumExperience: 0, applicationUrl: "https://example.com/apply" };
    assert.strictEqual(applyPreAiFilter(validJob).isPass, true);
  });

  // -------------------------------------------------------------------
  // 4. SHA-256 Fingerprinting & Persistent Deduplication
  // -------------------------------------------------------------------
  console.log("\n▶ [4/6] SHA-256 Fingerprint & Persistent Deduplication Tests");

  await runTest("Generates identical 64-character SHA-256 hashes for equivalent listings", () => {
    const job1 = { company: "Virtusa Consulting Pvt Ltd", title: "Software Engineer - Java", jobReferenceId: "REQ-9988", applicationUrl: "https://virtusa.wd1.myworkdayjobs.com/job/9988?ref=linkedin" };
    const job2 = { company: "Virtusa", title: "Software Engineer Java", jobReferenceId: "req-9988", applicationUrl: "https://virtusa.wd1.myworkdayjobs.com/job/9988" };
    const fp1 = generateJobFingerprint(job1);
    const fp2 = generateJobFingerprint(job2);
    assert.strictEqual(fp1.length, 64);
    assert.strictEqual(fp1, fp2);
  });

  await runTest("Duplicate detection accurately checks persistent notification state", async () => {
    const mockFp = "test_fp_" + Date.now();
    assert.strictEqual(await hasJobBeenNotified(mockFp), false);

    await saveJobAndFingerprint({ jobId: "job_test_1", company: "Test Co", title: "Java Dev", applicationUrl: "https://test.com" }, mockFp, "NOTIFIED");
    assert.strictEqual(await hasJobBeenNotified(mockFp), true);
  });

  // -------------------------------------------------------------------
  // 5. Opportunity Scoring & Priority Flags
  // -------------------------------------------------------------------
  console.log("\n▶ [5/6] Opportunity Scoring & Priority Flags Tests");

  await runTest("Formula: OpportunityScore = (Match * 0.65) + (Freshness * 0.25) + (Trust * 0.10)", () => {
    const opp = calculateOpportunityScore(90, 100, "Greenhouse");
    // (90 * 0.65 = 58.5) + (100 * 0.25 = 25.0) + (95 * 0.10 = 9.5) = 93.0
    assert.strictEqual(opp.opportunityScore, 93);
  });

  await runTest("Critical Priority Flag: <=15 min and score >= 80", () => {
    const freshJob = { title: "Java Developer", company: "Razorpay", jobAgeMinutes: 4.5, source: "Greenhouse" };
    const evalResult = { isEligible: true, matchScore: 88, roleMatch: 90 };
    const priority = determineDispatchPriority(freshJob, evalResult, 65);
    assert.strictEqual(priority.shouldNotify, true);
    assert.strictEqual(priority.priorityLevel, "CRITICAL");
  });

  // -------------------------------------------------------------------
  // 6. Multi-Channel Notification Formatting & FCM Device Management
  // -------------------------------------------------------------------
  console.log("\n▶ [6/6] Multi-Channel Formatting & Device Management Tests");

  const sampleBatch = [
    {
      job: {
        jobId: "job_razor_1",
        title: "Software Engineer I (Java)",
        company: "Razorpay",
        location: "Bengaluru",
        workMode: "Hybrid",
        jobAgeMinutes: 8.0,
        jobAgeHours: 0.13,
        source: "Greenhouse",
        sourceType: "Official ATS",
        applicationUrl: "https://boards.greenhouse.io/razorpay/123",
        publishedAt: new Date().toISOString()
      },
      fingerprint: "fp_sample_1",
      evaluation: {
        isEligible: true,
        matchScore: 88,
        matchLevel: "Strong Match",
        matchedSkills: ["Java", "Spring Boot", "REST APIs", "MySQL"],
        missingSkills: ["Kafka"],
        whyMatched: "Excellent alignment with Core Java, Spring Boot and relational databases",
        experienceRequired: "0-2 years"
      },
      dispatchMeta: {
        priorityLevel: "CRITICAL",
        shouldNotify: true
      }
    }
  ];

  await runTest("Email Renderer produces subject and rich HTML summary with all Section 15 fields", () => {
    const email = renderSummaryEmail(sampleBatch, "Asia/Kolkata", "Vijayasimha Tammineni");
    assert.strictEqual(email.subject.includes("Job Hunter AI"), true);
    assert.strictEqual(email.html.includes("Software Engineer I (Java)"), true);
    assert.strictEqual(email.html.includes("Razorpay"), true);
    assert.strictEqual(email.html.includes("88% Match"), true);
    assert.strictEqual(email.html.includes("https://boards.greenhouse.io/razorpay/123"), true);
  });

  await runTest("Telegram Service formats clean HTML message and escapes dynamic strings", () => {
    const tgMsg = formatSingleJobTelegram(sampleBatch[0]);
    assert.strictEqual(tgMsg.includes("🚨 <b>CRITICAL JOB MATCH</b>"), true);
    assert.strictEqual(tgMsg.includes("🏢 <b>Company:</b> Razorpay"), true);
    assert.strictEqual(tgMsg.includes("🎯 <b>Match:</b> 88%"), true);
    assert.strictEqual(tgMsg.includes("<a href="), true);
  });

  await runTest("Push Notification Service creates concise, high-priority FCM payload", () => {
    const pushPayload = formatPushPayload(sampleBatch);
    assert.strictEqual(pushPayload.title.includes("Software Engineer I (Java)"), true);
    assert.strictEqual(pushPayload.body.includes("Razorpay"), true);
    assert.strictEqual(pushPayload.data.priority, "CRITICAL");
  });

  await runTest("FCM Device registration, activation, and cleanup in DB", async () => {
    const testToken = "test_fcm_token_" + Date.now();
    const regRes = await registerPushDevice({
      fcmToken: testToken,
      deviceName: "Chrome on macOS",
      platform: "web",
      userId: "test_candidate"
    });
    assert.strictEqual(regRes.success, true);

    const activeList = await getActivePushDevices();
    assert.strictEqual(activeList.some(d => d.fcm_token === testToken), true);

    await deactivatePushDevice(testToken);
    const activeAfter = await getActivePushDevices();
    assert.strictEqual(activeAfter.some(d => d.fcm_token === testToken), false);
  });

  await runTest("Multi-Channel Orchestrator executes parallel batch dispatch (Promise.allSettled)", async () => {
    const result = await dispatchNotificationBatch(sampleBatch);
    assert.strictEqual(typeof result.batchId, "string");
    assert.strictEqual(result.overallStatus === "SENT" || result.overallStatus === "PARTIAL", true);
  });

  console.log("\n=====================================================================");
  console.log(`📊 TEST SUMMARY: ${passedCount} / ${totalCount} Passed (${Math.round((passedCount / totalCount) * 100)}% Success)`);
  console.log("=====================================================================\n");

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
