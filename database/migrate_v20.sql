-- Migration v20: Uniform year + year-specific pricing
ALTER TABLE student_uniform
  ADD COLUMN IF NOT EXISTS uniform_year VARCHAR(20);

ALTER TABLE student_uniform
  DROP CONSTRAINT IF EXISTS student_uniform_uniform_year_check;

ALTER TABLE student_uniform
  ADD CONSTRAINT student_uniform_uniform_year_check
  CHECK (uniform_year IS NULL OR uniform_year IN ('1st Year', '2nd Year'));

CREATE INDEX IF NOT EXISTS idx_student_uniform_year
  ON student_uniform(uniform_year, status);

-- Preserve legacy uniform records that used the old ₹1,500/set pricing.
UPDATE student_uniform
SET uniform_year = '1st Year'
WHERE status = 'received'
  AND set_count IN (1, 2)
  AND uniform_year IS NULL;
