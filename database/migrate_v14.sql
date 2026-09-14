-- Migration v14: New Admission source tracking
ALTER TABLE new_admissions
ADD COLUMN IF NOT EXISTS source VARCHAR(50);
