// =====================================================================
// End-to-End Mock Ingestion & Processing Verification
// =====================================================================

const fs = require("fs");
const path = require("path");
const { normalizeJob } = require("../src/pipeline/normalizer");
const { evaluateJobFreshness } = require("../src/pipeline/freshnessEngine");
const { generateJobFingerprint } = require("../src/pipeline/fingerprintEngine");
const { applyPreAiFilter } = require("../src/pipeline/preAiFilter");
const { classifyJobWithGemini } = require("../src/pipeline/geminiClassifier");
const { determineDispatchPriority, calculateOpportunityScore } = require("../src/pipeline/scoringEngine");
const { renderJobAlertEmail } = require("../src/notifications/emailRenderer");
const { sendJobAlertEmail } = require("../src/notifications/emailSender");
const { initDatabase, isDuplicateFingerprint, saveJobAndFingerprint, saveJobEvaluation } = require("../src/db/database");

async function runMockE2ETest() {
  console.log("=====================================================================");
  console.log("🚀 EXECUTING COMPLETE END-TO-END WORKFLOW SIMULATION");
  console.log("=====================================================================\n");

  await initDatabase();

  const now = new Date();
  const rawMockPath = path.resolve(__dirname, "mock_jobs.json");
  let mockDataRaw = fs.readFileSync(rawMockPath, "utf8").replace(/^\uFEFF/, "");

  // Inject dynamic dates
  mockDataRaw = mockDataRaw
    .replace("{{RECENT_30_MIN}}", new Date(now.getTime() - 30 * 60 * 1000).toISOString())
    .replace("{{RECENT_2_HOURS}}", new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString())
    .replace("{{STALE_45_HOURS}}", new Date(now.getTime() - 45 * 60 * 60 * 1000).toISOString())
    .replace("{{RECENT_1_HOUR}}", new Date(now.getTime() - 60 * 60 * 1000).toISOString())
    .replace("{{RECENT_1_HOUR}}", new Date(now.getTime() - 60 * 60 * 1000).toISOString())
    .replace("{{RECENT_1_HOUR}}", new Date(now.getTime() - 60 * 60 * 1000).toISOString());

  const mockListings = JSON.parse(mockDataRaw);

  console.log(`📦 Loaded ${mockListings.length} mock job postings across multiple test scenarios.\n`);

  for (const [index, raw] of mockListings.entries()) {
    console.log(`---------------------------------------------------------------------`);
    console.log(`[Job ${index + 1}/${mockListings.length}] "${raw.title}" at "${raw.company}"`);

    // 1. Normalize
    const normalized = normalizeJob(raw, raw.source);

    // 2. Freshness Check
    const freshness = evaluateJobFreshness(normalized, now);
    if (!freshness.isFresh) {
      console.log(`  🛑 [DROP: FRESHNESS] ${freshness.reason}`);
      continue;
    }
    const freshJob = freshness.job;
    console.log(`  ⏱️ [FRESH] Age: ${freshJob.jobAgeHours}h | Freshness Score: ${freshJob.freshnessScore}/100 (${freshJob.freshnessLabel})`);

    // 3. Deduplication Check
    const fingerprint = generateJobFingerprint(freshJob);
    const isDup = await isDuplicateFingerprint(fingerprint);
    if (isDup) {
      console.log(`  🛑 [DROP: DUPLICATE] Fingerprint already exists (${fingerprint.substring(0, 16)}...)`);
      continue;
    }

    // 4. Pre-AI Rule Filtering
    const preFilter = applyPreAiFilter(freshJob);
    if (!preFilter.isPass) {
      console.log(`  🛑 [DROP: PRE-FILTER] Category: ${preFilter.filterCategory} | Reason: ${preFilter.reason}`);
      await saveJobAndFingerprint(freshJob, fingerprint, "REJECTED_RULE_FILTER");
      continue;
    }
    console.log(`  🛡️ [PRE-FILTER PASS] Passed all deterministic rules.`);

    // 5. Gemini AI Evaluation
    await saveJobAndFingerprint(freshJob, fingerprint, "EVALUATING");
    const evaluation = await classifyJobWithGemini(freshJob);
    await saveJobEvaluation(freshJob.jobId, evaluation);
    console.log(`  🤖 [AI EVALUATION] Match Score: ${evaluation.matchScore}% | Level: ${evaluation.matchLevel}`);
    console.log(`     Why: ${evaluation.whyMatched}`);
    console.log(`     Matched Skills: ${(evaluation.matchedSkills || []).join(", ")}`);

    // 6. Opportunity Score & Dispatch Priority
    const opp = calculateOpportunityScore(evaluation.matchScore, freshJob.freshnessScore, freshJob.source);
    const dispatch = determineDispatchPriority(freshJob, evaluation, 65);
    console.log(`  📊 [DISPATCH ROUTER] Priority: ${dispatch.priorityLevel} | OppScore: ${opp.opportunityScore} | Should Email: ${dispatch.shouldEmail}`);

    // 7. Dispatch Alert
    if (dispatch.shouldEmail) {
      const emailPayload = renderJobAlertEmail(freshJob, evaluation, dispatch);
      await sendJobAlertEmail(freshJob, fingerprint, evaluation, dispatch, emailPayload);
      console.log(`  🚀 [EMAIL DISPATCHED] Subject: "${emailPayload.subject}"`);
    } else {
      console.log(`  💾 [STORED] Job saved to database without email alert.`);
    }
  }

  console.log(`\n=====================================================================`);
  console.log(`🎉 END-TO-END PIPELINE SIMULATION COMPLETED SUCCESSFULLY`);
  console.log(`=====================================================================\n`);
}

runMockE2ETest();
