-- Migration v11: New Admissions + optional student email

-- Email is optional for Candidates and New Admissions.
ALTER TABLE students
ALTER COLUMN email DROP NOT NULL;

-- Lightweight New Admissions table. It references the existing student record.
-- Removing a New Admission entry never deletes the student or related ERP data.
CREATE TABLE IF NOT EXISTS new_admissions (
  id         SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_new_admissions_student
  ON new_admissions(student_id);

CREATE INDEX IF NOT EXISTS idx_new_admissions_created
  ON new_admissions(created_at DESC);
