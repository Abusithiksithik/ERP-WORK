-- ============================================================
-- Migration v4: Fix discontinue/restore data consistency
-- ============================================================

-- 1. Update enrollments status constraint
ALTER TABLE enrollments
DROP CONSTRAINT IF EXISTS enrollments_status_check;

ALTER TABLE enrollments
ADD CONSTRAINT enrollments_status_check
CHECK (
    status IN (
        'pending',
        'approved',
        'rejected',
        'active',
        'inactive',
        'completed',
        'discontinued'
    )
);

-- 2. Ensure students table has all required discontinued columns
ALTER TABLE students
ADD COLUMN IF NOT EXISTS discontinued_at TIMESTAMPTZ;

ALTER TABLE students
ADD COLUMN IF NOT EXISTS discontinued_reason TEXT;

ALTER TABLE students
ADD COLUMN IF NOT EXISTS disc_cert_10th BOOLEAN DEFAULT false;

ALTER TABLE students
ADD COLUMN IF NOT EXISTS disc_cert_12th BOOLEAN DEFAULT false;

ALTER TABLE students
ADD COLUMN IF NOT EXISTS disc_cert_diploma BOOLEAN DEFAULT false;

-- 3. Fix existing discontinued students
UPDATE students
SET discontinued_at = NOW()
WHERE status = 'discontinued'
  AND discontinued_at IS NULL;

SELECT 'Migration v4 complete' AS result;