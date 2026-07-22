-- Run this once in your Supabase project's SQL Editor (Database > SQL Editor > New query).
-- This creates the two tables the backend needs. Uses gen_random_uuid(), which is
-- built into Supabase's Postgres by default (pgcrypto extension is pre-enabled).

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  correct_answer_text text not null,
  correct_answer_image_ocr text,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  name text not null,
  filename text not null,
  google_text text,
  google_confidence numeric,
  sarvam_text text,
  sarvam_status text default 'disabled',
  score jsonb,             -- headline score: { accuracy, verdict, feedback, coveredPoints, missingPoints }
  text_similarity jsonb,   -- secondary literal diff: { accuracy, wordAccuracy, charAccuracy, diff }
  sarvam_score jsonb,      -- filled in later if/when the Sarvam cross-check is re-enabled
  created_at timestamptz not null default now()
);

create index if not exists students_assignment_id_idx on students(assignment_id);

-- Row Level Security is intentionally left OFF here. Only this backend ever
-- queries these tables (using a secret/service-role key, server-side only,
-- never sent to the browser), so there's no untrusted caller to police. If
-- you later query these tables directly from the frontend, enable RLS and
-- add explicit policies at that point.