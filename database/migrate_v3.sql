-- ============================================================
-- EPFT Nalam Academy — Migration V3
-- Master Data Restructure: IMA / TNSCVT / Vetri Nichayam
-- Sub-Courses: DOT, DMLT, DHA (IMA); DOT, DMLT (TNSCVT);
--              GDA, DE, Admin Coordinator (Vetri Nichayam)
-- Batch Years: 2025-2027, 2026-2028 (paid); 2026 (free)
-- Uniform: sync students.uniform_received boolean
-- Idempotent — safe to run multiple times
-- ============================================================

-- 1. Add uniform_received flag to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS uniform_received BOOLEAN DEFAULT false;

-- 2. Add course_completion_date to students (for FREE course auto-calc)
ALTER TABLE students ADD COLUMN IF NOT EXISTS course_completion_date DATE;

-- 3. Add is_master_course flag to course_categories to protect them
ALTER TABLE course_categories ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

-- 4. Mark old categories inactive (but do NOT delete — preserve student references)
UPDATE course_categories
SET status = 'inactive'
WHERE category_name IN ('IMR', 'TN', 'FREE', 'IMA_OLD', 'TNSCVT_OLD')
  AND status = 'active';

-- Also mark any category not in our new set inactive
UPDATE course_categories
SET status = 'inactive'
WHERE category_name NOT IN ('IMA', 'TNSCVT', 'Vetri Nichayam')
  AND is_master IS NOT true;

-- 5. Create / ensure the three master categories exist
INSERT INTO course_categories (category_name, description, status, is_master)
VALUES
  ('IMA',             'IMA Master Course',             'active', true),
  ('TNSCVT',          'TNSCVT Master Course',          'active', true),
  ('Vetri Nichayam',  'Vetri Nichayam FREE Course',    'active', true)
ON CONFLICT (category_name) DO UPDATE
  SET status   = 'active',
      is_master = true,
      description = EXCLUDED.description;

-- 6. Add sub-courses (courses table) under each master category
-- These are the actual courses students enrol in
-- is_master = false (they are sub-courses), unique per (course_name, category_id)

DO $$
DECLARE
  ima_cat_id  INTEGER;
  tn_cat_id   INTEGER;
  free_cat_id INTEGER;
BEGIN
  SELECT id INTO ima_cat_id  FROM course_categories WHERE category_name = 'IMA'            LIMIT 1;
  SELECT id INTO tn_cat_id   FROM course_categories WHERE category_name = 'TNSCVT'         LIMIT 1;
  SELECT id INTO free_cat_id FROM course_categories WHERE category_name = 'Vetri Nichayam' LIMIT 1;

  -- Deactivate old sub-courses that are NOT in the new structure
  -- (only if they have no active students — preserve data)
  UPDATE courses
  SET status = 'inactive'
  WHERE category_id IN (ima_cat_id, tn_cat_id, free_cat_id)
    AND course_name NOT IN ('DOT', 'DMLT', 'DHA', 'GDA', 'DE', 'Admin Coordinator')
    AND id NOT IN (SELECT DISTINCT course_id FROM students WHERE course_id IS NOT NULL AND status != 'discontinued')
    AND id NOT IN (SELECT DISTINCT course_id FROM enrollments WHERE course_id IS NOT NULL);

  -- ── IMA Sub-Courses ──
  INSERT INTO courses (category_id, course_name, description, duration, fee_amount, is_free, status)
  VALUES
    (ima_cat_id, 'DOT',  'Diploma in Office Technology',         '2 Years', 25000, false, 'active'),
    (ima_cat_id, 'DMLT', 'Diploma in Medical Lab Technology',    '2 Years', 25000, false, 'active'),
    (ima_cat_id, 'DHA',  'Diploma in Hospital Administration',   '2 Years', 25000, false, 'active')
  ON CONFLICT (course_name, category_id) DO UPDATE
    SET duration   = '2 Years',
        fee_amount = 25000,
        is_free    = false,
        status     = 'active',
        description = EXCLUDED.description;

  -- ── TNSCVT Sub-Courses ──
  INSERT INTO courses (category_id, course_name, description, duration, fee_amount, is_free, status)
  VALUES
    (tn_cat_id, 'DOT',  'Diploma in Office Technology (TNSCVT)',       '2 Years', 25000, false, 'active'),
    (tn_cat_id, 'DMLT', 'Diploma in Medical Lab Technology (TNSCVT)',  '2 Years', 25000, false, 'active')
  ON CONFLICT (course_name, category_id) DO UPDATE
    SET duration   = '2 Years',
        fee_amount = 25000,
        is_free    = false,
        status     = 'active',
        description = EXCLUDED.description;

  -- ── Vetri Nichayam (FREE) Sub-Courses ──
  INSERT INTO courses (category_id, course_name, description, duration, fee_amount, is_free, status)
  VALUES
    (free_cat_id, 'GDA',               'General Duty Assistant',         '3 Months', 0, true, 'active'),
    (free_cat_id, 'DE',                'Data Entry Operator',             '3 Months', 0, true, 'active'),
    (free_cat_id, 'Admin Coordinator', 'Administrative Coordinator',     '3 Months', 0, true, 'active')
  ON CONFLICT (course_name, category_id) DO UPDATE
    SET duration   = '3 Months',
        fee_amount = 0,
        is_free    = true,
        status     = 'active',
        description = EXCLUDED.description;

END $$;

-- 7. Create batch years for paid sub-courses (2025-2027 and 2026-2028)
-- Each paid sub-course gets both batch years
DO $$
DECLARE
  crs RECORD;
BEGIN
  -- Ensure unique constraint exists (safe)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'batches_name_course_unique' AND table_name = 'batches'
  ) THEN
    ALTER TABLE batches ADD CONSTRAINT batches_name_course_unique UNIQUE (batch_name, course_id);
  END IF;

  -- Loop through all paid sub-courses
  FOR crs IN
    SELECT c.id, c.course_name, cc.category_name
    FROM courses c
    JOIN course_categories cc ON cc.id = c.category_id
    WHERE c.is_free = false
      AND c.status = 'active'
      AND cc.category_name IN ('IMA', 'TNSCVT')
  LOOP
    -- 2025-2027 batch (currently 2nd year — students started 2025)
    INSERT INTO batches (batch_name, course_id, start_date, end_date, status)
    VALUES ('2025-2027', crs.id, '2025-06-01', '2027-05-31', 'active')
    ON CONFLICT (batch_name, course_id) DO NOTHING;

    -- 2026-2028 batch (currently 1st year — students started 2026)
    INSERT INTO batches (batch_name, course_id, start_date, end_date, status)
    VALUES ('2026-2028', crs.id, '2026-06-01', '2028-05-31', 'active')
    ON CONFLICT (batch_name, course_id) DO NOTHING;
  END LOOP;

  -- FREE sub-courses: create a generic "2026" batch for grouping (optional)
  FOR crs IN
    SELECT c.id
    FROM courses c
    JOIN course_categories cc ON cc.id = c.category_id
    WHERE c.is_free = true
      AND c.status = 'active'
      AND cc.category_name = 'Vetri Nichayam'
  LOOP
    INSERT INTO batches (batch_name, course_id, start_date, end_date, status)
    VALUES ('2026', crs.id, '2026-01-01', '2026-12-31', 'active')
    ON CONFLICT (batch_name, course_id) DO NOTHING;
  END LOOP;

END $$;

-- 8. Sync existing student_uniform table → students.uniform_received
UPDATE students s
SET uniform_received = (su.status = 'received')
FROM student_uniform su
WHERE su.student_id = s.id
  AND su.status IS NOT NULL;

-- 9. Report
SELECT
  'Migration V3 complete!' AS result,
  (SELECT COUNT(*) FROM course_categories WHERE status='active' AND is_master=true) AS master_categories,
  (SELECT COUNT(*) FROM courses WHERE status='active') AS active_sub_courses,
  (SELECT COUNT(*) FROM batches WHERE status='active') AS active_batches;
