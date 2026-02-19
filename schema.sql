-- ============================================================
-- ApplyFlow AI — Supabase Database Schema
-- Run this in your Supabase SQL Editor (supabase.com → SQL Editor)
-- ============================================================


-- ─── USER PREFERENCES ──────────────────────────────────────────────────────────
-- Stores job search preferences for each user.
-- One row per user. Uses upsert (insert or update) to keep it simple.

CREATE TABLE IF NOT EXISTS preferences (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  roles         TEXT,                         -- e.g. "Software Engineer, Frontend Developer"
  keywords      TEXT,                         -- e.g. "React, remote, startup"
  location      TEXT,                         -- e.g. "San Francisco, CA"
  experience_level TEXT DEFAULT 'Mid-level',  -- Entry-level, Mid-level, Senior, etc.
  tech_stack    TEXT,                         -- e.g. "React, Node.js, Python"
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ─── JOBS ──────────────────────────────────────────────────────────────────────
-- Stores job listings discovered from job boards (Indeed, etc.)
-- Linked to the user who discovered them.

CREATE TABLE IF NOT EXISTS jobs (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title               TEXT NOT NULL,
  company             TEXT NOT NULL,
  location            TEXT,
  link                TEXT NOT NULL,           -- URL to the job posting
  posted_date         TIMESTAMPTZ,
  description_snippet TEXT,                    -- First 300 chars of job description
  source              TEXT DEFAULT 'Indeed',   -- Which job board it came from
  match_score         INTEGER DEFAULT 50,      -- 0-100 AI match score
  created_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent storing the same job link twice for the same user
  UNIQUE(user_id, link)
);


-- ─── APPLICATIONS ──────────────────────────────────────────────────────────────
-- Stores job applications that the user has tracked.
-- Created when the user clicks "Mark Applied" on a job card.

CREATE TABLE IF NOT EXISTS applications (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  job_id        UUID REFERENCES jobs(id) ON DELETE SET NULL,  -- Optional link to job
  company       TEXT NOT NULL,
  role          TEXT NOT NULL,
  location      TEXT,
  apply_url     TEXT,                         -- URL to the job application
  posted_date   TIMESTAMPTZ,
  applied_date  TIMESTAMPTZ DEFAULT NOW(),
  status        TEXT DEFAULT 'Applied',       -- Applied, Pending, Shortlisted, Interviewing, Offered, Rejected
  email_sent    BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,
  contact_name  TEXT,                         -- Recruiter/contact name if known
  contact_email TEXT,                         -- Recruiter/contact email if known
  notes         TEXT,                         -- User's personal notes
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ─── GMAIL TOKENS ──────────────────────────────────────────────────────────────
-- Stores OAuth refresh tokens for Gmail integration.
-- One row per user. The refresh token lets us send emails on their behalf.

CREATE TABLE IF NOT EXISTS gmail_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,                -- Long-lived token from Google OAuth
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- This is critical! Without RLS, any user could read/write any row.
-- These policies ensure users can only access their own data.
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;


-- ── PREFERENCES POLICIES ──────────────────────────────────────

-- Users can read their own preferences
CREATE POLICY "Users can read own preferences"
  ON preferences FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON preferences FOR UPDATE
  USING (auth.uid() = user_id);


-- ── JOB POLICIES ──────────────────────────────────────────────

-- Users can read their own jobs
CREATE POLICY "Users can read own jobs"
  ON jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own jobs
CREATE POLICY "Users can insert own jobs"
  ON jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own jobs
CREATE POLICY "Users can delete own jobs"
  ON jobs FOR DELETE
  USING (auth.uid() = user_id);


-- ── APPLICATION POLICIES ──────────────────────────────────────

-- Users can read their own applications
CREATE POLICY "Users can read own applications"
  ON applications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own applications
CREATE POLICY "Users can insert own applications"
  ON applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own applications
CREATE POLICY "Users can update own applications"
  ON applications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own applications
CREATE POLICY "Users can delete own applications"
  ON applications FOR DELETE
  USING (auth.uid() = user_id);


-- ── GMAIL TOKEN POLICIES ──────────────────────────────────────

-- Users can read their own Gmail tokens
CREATE POLICY "Users can read own gmail tokens"
  ON gmail_tokens FOR SELECT
  USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- These speed up common database queries significantly.
-- ═══════════════════════════════════════════════════════════════

-- Speed up job lookups by user
CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);

-- Speed up job sorting by date
CREATE INDEX IF NOT EXISTS jobs_posted_date_idx ON jobs(posted_date DESC);

-- Speed up application lookups by user
CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications(user_id);

-- Speed up application sorting by date
CREATE INDEX IF NOT EXISTS applications_applied_date_idx ON applications(applied_date DESC);

-- Speed up filtering applications by status
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status);
