-- ============================================================
-- Migration v8: Simplify student and enrollment status values
-- Tracked by schema_migrations — runs exactly once per database.
-- Safe to run on existing data: no records are deleted.
-- ============================================================

-- ── 1. Convert students with 'inactive' or 'suspended' → 'active' ──
-- These students are real people who should remain in the system.
UPDATE students
SET status = 'active'
WHERE status IN ('inactive', 'suspended');

-- ── 2. Convert enrollments with legacy statuses → 'approved' ──
-- 'pending', 'rejected', 'active', 'inactive', 'completed' all become 'approved'.
-- 'discontinued' enrollments are preserved exactly as-is.
UPDATE enrollments
SET status = 'approved'
WHERE status IN ('pending', 'rejected', 'active', 'inactive', 'completed');

-- ── 3. Replace students status CHECK constraint ──
-- New allowed values: active, discontinued ONLY.
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_status_check;
ALTER TABLE students ADD CONSTRAINT students_status_check
  CHECK (status IN ('active', 'discontinued'));

-- ── 4. Replace enrollments status CHECK constraint ──
-- New allowed values: approved, discontinued ONLY.
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_status_check;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_status_check
  CHECK (status IN ('approved', 'discontinued'));

-- ── 5. Verify (informational — does not affect migration success) ──
DO $$
DECLARE
  bad_students  INTEGER;
  bad_enrollments INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_students
    FROM students WHERE status NOT IN ('active', 'discontinued');
  SELECT COUNT(*) INTO bad_enrollments
    FROM enrollments WHERE status NOT IN ('approved', 'discontinued');

  IF bad_students > 0 THEN
    RAISE WARNING 'migrate_v8: % students still have unexpected status values', bad_students;
  END IF;
  IF bad_enrollments > 0 THEN
    RAISE WARNING 'migrate_v8: % enrollments still have unexpected status values', bad_enrollments;
  END IF;
END $$;

SELECT 'Migration v8 complete' AS result;
