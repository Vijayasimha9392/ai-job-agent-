-- =====================================================================
-- AI Job Recommendation Agent - PostgreSQL Schema
-- =====================================================================

CREATE TABLE IF NOT EXISTS pipeline_state (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    job_id VARCHAR(64) PRIMARY KEY,
    job_fingerprint VARCHAR(64) UNIQUE NOT NULL,
    source VARCHAR(50) NOT NULL,
    company VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    location VARCHAR(255) DEFAULT 'India',
    work_mode VARCHAR(50) DEFAULT 'Not Specified',
    employment_type VARCHAR(50) DEFAULT 'Full-time',
    description TEXT,
    skills TEXT[] DEFAULT '{}',
    minimum_experience NUMERIC(3,1),
    maximum_experience NUMERIC(3,1),
    education VARCHAR(255),
    published_at TIMESTAMP WITH TIME ZONE,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    job_age_hours NUMERIC(6,2),
    freshness_verified BOOLEAN DEFAULT FALSE,
    application_url TEXT NOT NULL,
    company_careers_url TEXT,
    salary VARCHAR(100),
    job_reference_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'NEW', -- NEW, EMAILED, VIEWED, APPLIED, REJECTED, EXPIRED, DUPLICATE
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_fingerprints (
    job_fingerprint VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    company VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    application_url TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    first_detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    match_score INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'NEW'
);

CREATE TABLE IF NOT EXISTS job_evaluations (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(64) REFERENCES jobs(job_id) ON DELETE CASCADE,
    is_eligible BOOLEAN NOT NULL,
    reject_reason TEXT,
    match_score INTEGER NOT NULL,
    match_level VARCHAR(50) NOT NULL,
    role_match INTEGER,
    skills_match INTEGER,
    experience_match INTEGER,
    location_match INTEGER,
    education_match INTEGER,
    freshness_score INTEGER,
    matched_skills TEXT[] DEFAULT '{}',
    missing_skills TEXT[] DEFAULT '{}',
    experience_required VARCHAR(100),
    candidate_experience_suitable BOOLEAN,
    why_matched TEXT,
    application_priority VARCHAR(50),
    confidence NUMERIC(4,2),
    raw_gemini_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(64) REFERENCES jobs(job_id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    match_score INTEGER NOT NULL,
    application_priority VARCHAR(50),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivery_status VARCHAR(50) DEFAULT 'SENT',
    error_message TEXT
);

-- Indexes for performance & rapid 10-minute duplicate checks
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(job_fingerprint);
CREATE INDEX IF NOT EXISTS idx_jobs_published_at ON jobs(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_evaluations_score ON job_evaluations(match_score DESC);
CREATE INDEX IF NOT EXISTS idx_job_evaluations_job_id ON job_evaluations(job_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_job_id ON email_logs(job_id);

-- Initial State
INSERT INTO pipeline_state (key, value)
VALUES ('last_run_state', '{"last_successful_run": null, "total_scans": 0, "total_matches": 0, "total_emails": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;
