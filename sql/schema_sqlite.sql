-- =====================================================================
-- AI Job Recommendation Agent - SQLite Schema (Embedded Fallback)
-- =====================================================================

CREATE TABLE IF NOT EXISTS pipeline_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    job_fingerprint TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    source_type TEXT DEFAULT 'API',
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT DEFAULT 'India',
    work_mode TEXT DEFAULT 'Not Specified',
    employment_type TEXT DEFAULT 'Full-time',
    description TEXT,
    skills TEXT DEFAULT '[]',
    minimum_experience REAL,
    maximum_experience REAL,
    education TEXT,
    published_at DATETIME,
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    job_age_minutes REAL,
    job_age_hours REAL,
    freshness_verified INTEGER DEFAULT 0,
    application_url TEXT NOT NULL,
    company_careers_url TEXT,
    salary TEXT,
    job_reference_id TEXT,
    match_score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'NEW',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_fingerprints (
    job_fingerprint TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT,
    application_url TEXT NOT NULL,
    published_at DATETIME,
    discovered_at DATETIME,
    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    match_score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'NEW',
    notification_status TEXT DEFAULT 'UNNOTIFIED',
    notified_at DATETIME
);

CREATE TABLE IF NOT EXISTS job_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
    is_eligible INTEGER NOT NULL,
    reject_reason TEXT,
    match_score INTEGER NOT NULL,
    match_level TEXT NOT NULL,
    role_match INTEGER,
    skills_match INTEGER,
    experience_match INTEGER,
    location_match INTEGER,
    education_match INTEGER,
    freshness_score INTEGER,
    matched_skills TEXT DEFAULT '[]',
    missing_skills TEXT DEFAULT '[]',
    experience_required TEXT,
    candidate_experience_suitable INTEGER,
    why_matched TEXT,
    application_priority TEXT,
    confidence REAL,
    raw_gemini_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    job_fingerprint TEXT NOT NULL,
    queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    email_status TEXT DEFAULT 'PENDING',
    email_sent_at DATETIME,
    email_error TEXT,
    telegram_status TEXT DEFAULT 'PENDING',
    telegram_sent_at DATETIME,
    telegram_error TEXT,
    push_status TEXT DEFAULT 'PENDING',
    push_sent_at DATETIME,
    push_error TEXT,
    overall_status TEXT DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS push_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default_user',
    device_name TEXT,
    platform TEXT DEFAULT 'web',
    fcm_token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS source_state (
    source_name TEXT PRIMARY KEY,
    tier TEXT DEFAULT 'FAST',
    poll_interval_minutes INTEGER DEFAULT 2,
    last_successful_run DATETIME,
    last_seen_job_id TEXT,
    last_error TEXT,
    total_jobs_fetched INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_runs (
    run_id TEXT PRIMARY KEY,
    tier TEXT DEFAULT 'FAST',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    duration_ms INTEGER,
    sources_polled TEXT,
    jobs_discovered INTEGER DEFAULT 0,
    jobs_fresh INTEGER DEFAULT 0,
    jobs_passed_filter INTEGER DEFAULT 0,
    jobs_evaluated INTEGER DEFAULT 0,
    jobs_qualified INTEGER DEFAULT 0,
    notifications_sent INTEGER DEFAULT 0,
    errors TEXT
);

CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    match_score INTEGER NOT NULL,
    application_priority TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivery_status TEXT DEFAULT 'SENT',
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(job_fingerprint);
CREATE INDEX IF NOT EXISTS idx_jobs_published_at ON jobs(published_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_notifications_batch ON notifications(batch_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_token ON push_devices(fcm_token);

