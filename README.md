# AI Job Recommendation Agent (India - Java Full Stack Developer)

> **Autonomous 24/7 Recruitment Intelligence Agent** designed specifically for an early-career Java Full Stack Developer (2025 B.Tech CSE Graduate, ~8–12 months experience). Continuously searches across India every 10 minutes, validates freshness (<40 hours), screens noise with deterministic rule-based algorithms, analyzes match quality with **Google Gemini 2.5 Flash**, deduplicates via SHA-256 fingerprinting, and dispatches high-urgency HTML email alerts with direct application links.

---

## 🌟 Key Capabilities

1. **Strict Freshness Priority (0–40 Hours)**
   - **Urgent (0–1h ago)**: Score 100
   - **Priority 2 (1–3h ago)**: Score 95
   - **Priority 3 (3–6h ago)**: Score 90
   - **Priority 4 (6–12h ago)**: Score 85
   - **Priority 5 (12–24h ago)**: Score 75
   - **Priority 6 (24–40h ago)**: Score 60
   - **Hard Reject (>40h ago)**: Score 0 (Discarded immediately)

2. **Dual-Engine Implementation**
   - **n8n Workflow**: Production-ready, 100% valid importable JSON (`n8n/job_agent_workflow.json`) with all 11+ interconnected nodes, exact JavaScript logic, and error handlers.
   - **Node.js Autonomous Engine**: Modular standalone runner (`src/index.js`) with zero external dependency requirements on modern Node.js 18+.

3. **Multi-Source Job Aggregation**
   - Direct ATS Public Feeds (Greenhouse, Lever, SmartRecruiters)
   - Public Job APIs (Arbeitnow, Remotive, JSearch/RapidAPI, Adzuna)
   - RSS and company career feeds

4. **Zero-Cost Pre-AI Noise Filter**
   - Filters out Senior, Lead, Principal, Architect, and Manager roles.
   - Rejects mandatory 3+ years experience listings.
   - Blocks non-development listings (BPO, Sales, Support, HR, Manual Testing).
   - Detects suspicious / fee-charging scams before calling Gemini.

5. **Deep AI Job Matching with Google Gemini 2.5 Flash**
   - Structured JSON mode (`responseMimeType: "application/json"`).
   - Evaluates technical stack, career level, 2025 graduate eligibility, and why the job is suitable.
   - Exponential backoff retry logic.

6. **Persistent Deduplication Engine**
   - Canonical SHA-256 fingerprinting on `company + title + refId/url`.
   - Idempotent PostgreSQL schema and local JSON store fallback.

7. **Urgent HTML Email Notifications**
   - Dynamic urgency badges (`🔥 Apply Now: Posted < 3h ago`).
   - Matched and missing skill chips, match percentage gauge, and direct official portal CTA button.

---

## 📁 Repository Structure

```
ai-job-agent/
├── n8n/
│   ├── job_agent_workflow.json      # Valid importable n8n workflow JSON
│   └── docker-compose.yml           # n8n + PostgreSQL 16 container setup
├── sql/
│   ├── schema.sql                   # PostgreSQL production DDL with indexes
│   └── schema_sqlite.sql            # SQLite fallback schema
├── src/
│   ├── config/
│   │   ├── candidateProfile.js      # Candidate qualifications, skills, weights
│   │   └── env.js                   # Zero-dependency environment loader
│   ├── db/
│   │   └── database.js              # PostgreSQL client with local fallback
│   ├── notifications/
│   │   ├── emailRenderer.js         # HTML & plain-text email generator
│   │   └── emailSender.js           # Nodemailer SMTP with preview simulation
│   ├── pipeline/
│   │   ├── normalizer.js            # Heterogeneous payload normalizer
│   │   ├── freshnessEngine.js       # Deterministic age & freshness scoring
│   │   ├── fingerprintEngine.js     # SHA-256 duplicate fingerprint generator
│   │   ├── preAiFilter.js           # Deterministic rule-based filter
│   │   ├── geminiClassifier.js      # Gemini 2.5 Flash structured AI classifier
│   │   └── scoringEngine.js         # Composite opportunity score router
│   ├── sources/
│   │   ├── jsearchFetcher.js        # RapidAPI JSearch client
│   │   ├── arbeitnowFetcher.js      # Arbeitnow public API client
│   │   ├── remotiveFetcher.js       # Remotive developer jobs client
│   │   ├── adzunaFetcher.js         # Adzuna India developer jobs client
│   │   ├── atsFeedsFetcher.js       # Direct Greenhouse & Lever parser
│   │   └── sourceAggregator.js      # Fault-tolerant concurrent ingestor
│   └── index.js                     # 10-minute scheduler & pipeline runner
├── templates/
│   └── job_alert.html               # Responsive HTML email alert template
├── tests/
│   ├── mock_jobs.json               # Edge-case test dataset (fresh, stale, senior)
│   ├── test_pipeline.js             # Automated unit test suite
│   └── test_e2e_mock.js             # End-to-end simulated run
├── .env.example                     # Environment variables template
└── README.md
```

---

## ⚡ Quick Start (Node.js Autonomous Engine)

### 1. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your `GEMINI_API_KEY`, `CANDIDATE_EMAIL`, and SMTP details.

### 2. Run Test Suite
```bash
node tests/test_pipeline.js
```

### 3. Run End-to-End Mock Simulation
```bash
node tests/test_e2e_mock.js
```

### 4. Start 24/7 Agent
```bash
node src/index.js
```

---

## 🐳 Quick Start (n8n Workflow)

1. Start n8n and PostgreSQL via Docker:
   ```bash
   cd n8n
   docker compose up -d
   ```
2. Open `http://localhost:5678` in your browser.
3. In n8n, click **Add Workflow -> Import from File** and select `n8n/job_agent_workflow.json`.
4. Add your `GEMINI_API_KEY` and `CANDIDATE_EMAIL` in n8n environment or credentials.
5. Click **Activate Workflow**. The agent will now run every 10 minutes automatically!
