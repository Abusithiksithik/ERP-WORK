-- Migration v16: Uniform set tracking
-- Tracks whether a student received uniform and the number of sets (1 or 2).

ALTER TABLE student_uniform
  ADD COLUMN IF NOT EXISTS set_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE student_uniform
  DROP CONSTRAINT IF EXISTS student_uniform_set_count_check;

ALTER TABLE student_uniform
  ADD CONSTRAINT student_uniform_set_count_check
  CHECK (set_count IN (0, 1, 2));

CREATE INDEX IF NOT EXISTS idx_student_uniform_status
  ON student_uniform(status, set_count);
