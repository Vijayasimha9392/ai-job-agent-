-- =====================================================================
-- AI Job Recommendation Agent - PostgreSQL / Supabase Schema
-- =====================================================================

CREATE TABLE IF NOT EXISTS pipeline_state (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(128) PRIMARY KEY,
    job_id VARCHAR(128),
    job_fingerprint VARCHAR(64) UNIQUE NOT NULL,
    source VARCHAR(64) NOT NULL,
    source_type VARCHAR(64) DEFAULT 'API',
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
    job_age_minutes NUMERIC(8,2),
    job_age_hours NUMERIC(6,2),
    freshness_verified BOOLEAN DEFAULT FALSE,
    application_url TEXT NOT NULL,
    company_careers_url TEXT,
    salary VARCHAR(100),
    job_reference_id VARCHAR(100),
    match_score INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'NEW', -- NEW, NOTIFIED, VIEWED, APPLIED, REJECTED, EXPIRED, DUPLICATE
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_fingerprints (
    job_fingerprint VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(128) NOT NULL,
    company VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    source VARCHAR(64),
    application_url TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    discovered_at TIMESTAMP WITH TIME ZONE,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    match_score INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'NEW',
    notification_status VARCHAR(50) DEFAULT 'UNNOTIFIED', -- UNNOTIFIED, NOTIFIED, PARTIAL, FAILED
    notified_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS job_evaluations (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(128) REFERENCES jobs(id) ON DELETE CASCADE,
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

-- Multi-channel notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(128) PRIMARY KEY,
    batch_id VARCHAR(128) NOT NULL,
    job_fingerprint VARCHAR(64) NOT NULL,
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    email_status VARCHAR(32) DEFAULT 'PENDING',    -- PENDING, SENT, FAILED, SKIPPED
    email_sent_at TIMESTAMP WITH TIME ZONE,
    email_error TEXT,
    telegram_status VARCHAR(32) DEFAULT 'PENDING', -- PENDING, SENT, FAILED, SKIPPED
    telegram_sent_at TIMESTAMP WITH TIME ZONE,
    telegram_error TEXT,
    push_status VARCHAR(32) DEFAULT 'PENDING',     -- PENDING, SENT, FAILED, SKIPPED
    push_sent_at TIMESTAMP WITH TIME ZONE,
    push_error TEXT,
    overall_status VARCHAR(32) DEFAULT 'PENDING',  -- PENDING, SENT, PARTIAL, FAILED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Registered push devices for Firebase Cloud Messaging
CREATE TABLE IF NOT EXISTS push_devices (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) DEFAULT 'default_user',
    device_name VARCHAR(255),
    platform VARCHAR(64) DEFAULT 'web', -- web, android, ios, desktop
    fcm_token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Source health & polling state
CREATE TABLE IF NOT EXISTS source_state (
    source_name VARCHAR(128) PRIMARY KEY,
    tier VARCHAR(32) DEFAULT 'FAST', -- FAST (2m), NORMAL (5m), RESTRICTED (15m)
    poll_interval_minutes INTEGER DEFAULT 2,
    last_successful_run TIMESTAMP WITH TIME ZONE,
    last_seen_job_id VARCHAR(255),
    last_error TEXT,
    total_jobs_fetched INTEGER DEFAULT 0
);

-- Audit log for agent run cycles
CREATE TABLE IF NOT EXISTS agent_runs (
    run_id VARCHAR(128) PRIMARY KEY,
    tier VARCHAR(32) DEFAULT 'FAST',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    sources_polled JSONB,
    jobs_discovered INTEGER DEFAULT 0,
    jobs_fresh INTEGER DEFAULT 0,
    jobs_passed_filter INTEGER DEFAULT 0,
    jobs_evaluated INTEGER DEFAULT 0,
    jobs_qualified INTEGER DEFAULT 0,
    notifications_sent INTEGER DEFAULT 0,
    errors JSONB
);

-- Legacy email logs compatibility
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(128),
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    match_score INTEGER NOT NULL,
    application_priority VARCHAR(50),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivery_status VARCHAR(50) DEFAULT 'SENT',
    error_message TEXT
);

-- Indexes for performance & rapid near-real-time duplicate checks
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(job_fingerprint);
CREATE INDEX IF NOT EXISTS idx_jobs_published_at ON jobs(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_fingerprints_status ON job_fingerprints(status);
CREATE INDEX IF NOT EXISTS idx_notifications_batch ON notifications(batch_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_token ON push_devices(fcm_token);
CREATE INDEX IF NOT EXISTS idx_push_devices_active ON push_devices(is_active);

-- Initial State
INSERT INTO pipeline_state (key, value)
VALUES ('last_run_state', '{"last_successful_run": null, "total_scans": 0, "total_matches": 0, "total_emails": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;

