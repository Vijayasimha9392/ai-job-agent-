-- =====================================================================
-- AI Job Recommendation Agent - SQLite Schema (Embedded Fallback)
-- =====================================================================

CREATE TABLE IF NOT EXISTS pipeline_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    job_fingerprint TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
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
    job_age_hours REAL,
    freshness_verified INTEGER DEFAULT 0,
    application_url TEXT NOT NULL,
    company_careers_url TEXT,
    salary TEXT,
    job_reference_id TEXT,
    status TEXT DEFAULT 'NEW',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_fingerprints (
    job_fingerprint TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    application_url TEXT NOT NULL,
    published_at DATETIME,
    first_detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    email_sent_at DATETIME,
    match_score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'NEW'
);

CREATE TABLE IF NOT EXISTS job_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT REFERENCES jobs(job_id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT REFERENCES jobs(job_id) ON DELETE CASCADE,
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
