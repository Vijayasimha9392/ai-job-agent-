# AI Job Recommendation Agent (India - Java Full Stack Developer)

An automated job-discovery and matching project for an early-career Java Full Stack Developer. The repository contains two implementations: a Node.js engine and an importable n8n workflow.

Both implementations are configured to:
- Run a discovery cycle every **55 minutes**.
- Reject listings older than **30 hours** when a valid publication timestamp is available.
- Use **Gemini 3.6 Flash** for job-match evaluation.
- Apply deterministic filters before AI evaluation and send alerts for qualifying matches.

> Publication timestamps that are missing or invalid are handled differently by the two implementations. The Node.js engine retains them as unverified with reduced freshness priority; the n8n workflow drops them.

## Key capabilities

1. **Freshness scoring (Node.js engine)**
   - 0–5 minutes: 100
   - 5–15 minutes: 98
   - 15–30 minutes: 95
   - 30–60 minutes: 90
   - 1–3 hours: 85
   - 3–6 hours: 80
   - 6–12 hours: 75
   - 12–24 hours: 70
   - 24–30 hours: 60
   - Older than 30 hours: rejected

2. **Two execution options**
   - **Node.js:** modular pipeline, source aggregation, persistent deduplication, AI classification and multi-channel notifications.
   - **n8n:** importable visual workflow with scheduled execution, job-source aggregation, rule-based filtering, Gemini evaluation and email notification.

3. **Job-source aggregation**
   - Node.js source modules include direct ATS feeds and supported public job APIs.
   - The n8n workflow currently includes Arbeitnow and Remotive source nodes.

4. **Pre-AI filtering**
   - Filters senior and non-development roles.
   - Rejects explicit mandatory experience requirements above the target range.
   - Requires a usable application URL.

5. **Gemini job matching**
   - Uses the Gemini API with JSON response mode.
   - Evaluates role fit, skills, experience and candidate suitability.
   - The Node.js model is configurable through `GEMINI_MODEL`; the default is `gemini-3.6-flash`.

6. **Deduplication and notifications**
   - SHA-256 fingerprints help prevent duplicate job alerts.
   - The Node.js implementation supports email, Telegram and push notification channels, subject to configuration.

## Repository structure

```text
n8n/
  job_agent_workflow.json
  docker-compose.yml
sql/
  schema.sql
  schema_sqlite.sql
src/
  config/
  db/
  notifications/
  pipeline/
  sources/
  index.js
templates/
tests/
.env.example
README.md
LICENSE
```

## Requirements

- Node.js 18 or later
- npm
- A Google Gemini API key
- Optional credentials for the job APIs, database and notification channels you enable
- Docker and Docker Compose if you want to run the n8n/PostgreSQL setup

## Run the Node.js engine

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example environment file and configure your credentials:
   ```bash
   cp .env.example .env
   ```

   Set at least `GEMINI_API_KEY` and the email settings you intend to use. Configure optional job-source API keys and notification credentials as needed. Keep `.env` private and never commit it.

3. Run the test suite:
   ```bash
   npm test
   ```

4. Start the agent:
   ```bash
   npm start
   ```

The Node.js engine runs an initial scan at startup and then schedules subsequent scans every 55 minutes.

## Run the n8n workflow

1. Configure the environment variables used by `n8n/docker-compose.yml`, including `GEMINI_API_KEY`, `CANDIDATE_EMAIL` and the SMTP settings.
2. Start the services:
   ```bash
   cd n8n
   docker compose up -d
   ```

3. Open n8n at `http://localhost:5678`.
4. Import `n8n/job_agent_workflow.json`.
5. Confirm the credentials and environment variables, then publish/activate the workflow.

The workflow schedule is configured as a **55-minute interval**. If you already imported an older copy, update the Schedule Trigger to Minutes / 55 and republish it, or import the corrected workflow as a new workflow. Updating the JSON file in GitHub does not automatically update a workflow already imported into your n8n instance.

## Freshness configuration

The Node.js engine reads `MAX_JOB_AGE_HOURS` from `.env` (default: 30). The n8n workflow currently uses a 30-hour cutoff directly in its workflow code. Keep these values aligned if you change the policy.

## Licensing

This project is licensed under the MIT License. See [LICENSE](LICENSE).
