-- ============================================================
-- EPFT Nalam Academy — Migration V2
-- Adds: guardian_type, student_materials, student_uniform,
--       is_master courses, payment_type, and sample data
-- Idempotent — safe to run multiple times
-- ============================================================

-- 1. Ensure guardian_type exists on students
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_type VARCHAR(20) DEFAULT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_present BOOLEAN DEFAULT false;

-- 2. Ensure cert_* columns exist on students
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_10th_collected  BOOLEAN DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_12th_collected  BOOLEAN DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_diploma_collected BOOLEAN DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_10th_url   VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_12th_url   VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_diploma_url VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS disc_cert_10th  BOOLEAN DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS disc_cert_12th  BOOLEAN DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS disc_cert_diploma BOOLEAN DEFAULT false;

-- 3. Fix student status check to include all needed statuses
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_status_check;
ALTER TABLE students ADD CONSTRAINT students_status_check
  CHECK (status IN ('active', 'inactive', 'discontinued'));

-- 4. payment_type column on payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) DEFAULT 'course_fee';

-- 5. Add is_master flag to courses (protects IMR/TN/FREE from deletion)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

-- 6. Enrollment batch_id support via student sync already exists

-- 7. student_materials table
CREATE TABLE IF NOT EXISTS student_materials (
  id           SERIAL PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  material_type VARCHAR(50) DEFAULT 'book',
  date_given   DATE DEFAULT CURRENT_DATE,
  given_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_materials_student ON student_materials(student_id);

-- 8. student_uniform table
CREATE TABLE IF NOT EXISTS student_uniform (
  id         SERIAL PRIMARY KEY,
  student_id INTEGER UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status     VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('received', 'not_received', 'pending')),
  notes      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 9. Master categories (IMR, TN, FREE) — idempotent
INSERT INTO course_categories (category_name, description, status)
VALUES
  ('IMR',  'IMR Course',  'active'),
  ('TN',   'TN Course',   'active'),
  ('FREE', 'Free Course', 'active')
ON CONFLICT (category_name) DO UPDATE
  SET status = 'active';

-- 10. Master courses — idempotent, tied to categories
DO $$ 
DECLARE
  imr_cat_id  INTEGER;
  tn_cat_id   INTEGER;
  free_cat_id INTEGER;
BEGIN
  SELECT id INTO imr_cat_id  FROM course_categories WHERE category_name = 'IMR'  LIMIT 1;
  SELECT id INTO tn_cat_id   FROM course_categories WHERE category_name = 'TN'   LIMIT 1;
  SELECT id INTO free_cat_id FROM course_categories WHERE category_name = 'FREE' LIMIT 1;

  -- IMR master course
  INSERT INTO courses (category_id, course_name, duration, fee_amount, is_free, status, is_master)
  VALUES (imr_cat_id, 'IMR', '1 Year', 25000, false, 'active', true)
  ON CONFLICT (course_name, category_id) DO UPDATE
    SET fee_amount = 25000, is_free = false, status = 'active', is_master = true,
        duration = '1 Year';

  -- TN master course
  INSERT INTO courses (category_id, course_name, duration, fee_amount, is_free, status, is_master)
  VALUES (tn_cat_id, 'TN', '1 Year', 25000, false, 'active', true)
  ON CONFLICT (course_name, category_id) DO UPDATE
    SET fee_amount = 25000, is_free = false, status = 'active', is_master = true,
        duration = '1 Year';

  -- FREE master course
  INSERT INTO courses (category_id, course_name, duration, fee_amount, is_free, status, is_master)
  VALUES (free_cat_id, 'FREE', '1 Year', 0, true, 'active', true)
  ON CONFLICT (course_name, category_id) DO UPDATE
    SET fee_amount = 0, is_free = true, status = 'active', is_master = true,
        duration = '1 Year';
END $$;

-- 11. Academic year batches 2026-2027 for each master course — idempotent
DO $$
DECLARE
  imr_id  INTEGER;
  tn_id   INTEGER;
  free_id INTEGER;
BEGIN
  SELECT id INTO imr_id  FROM courses WHERE course_name = 'IMR'  AND is_master = true LIMIT 1;
  SELECT id INTO tn_id   FROM courses WHERE course_name = 'TN'   AND is_master = true LIMIT 1;
  SELECT id INTO free_id FROM courses WHERE course_name = 'FREE' AND is_master = true LIMIT 1;

  -- Ensure unique constraint exists (safe to run multiple times)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'batches_name_course_unique' AND table_name = 'batches'
  ) THEN
    ALTER TABLE batches ADD CONSTRAINT batches_name_course_unique UNIQUE (batch_name, course_id);
  END IF;

  -- 2026-2027 batches (active)
  INSERT INTO batches (batch_name, course_id, start_date, end_date, status)
  VALUES ('2026-2027', imr_id,  '2026-06-01', '2027-05-31', 'active')
  ON CONFLICT (batch_name, course_id) DO NOTHING;

  INSERT INTO batches (batch_name, course_id, start_date, end_date, status)
  VALUES ('2026-2027', tn_id,   '2026-06-01', '2027-05-31', 'active')
  ON CONFLICT (batch_name, course_id) DO NOTHING;

  INSERT INTO batches (batch_name, course_id, start_date, end_date, status)
  VALUES ('2026-2027', free_id, '2026-06-01', '2027-05-31', 'active')
  ON CONFLICT (batch_name, course_id) DO NOTHING;

  -- 2025-2026 batches (previous year - inactive)
  INSERT INTO batches (batch_name, course_id, start_date, end_date, status)
  VALUES ('2025-2026', imr_id,  '2025-06-01', '2026-05-31', 'inactive')
  ON CONFLICT (batch_name, course_id) DO NOTHING;

  INSERT INTO batches (batch_name, course_id, start_date, end_date, status)
  VALUES ('2025-2026', tn_id,   '2025-06-01', '2026-05-31', 'inactive')
  ON CONFLICT (batch_name, course_id) DO NOTHING;

  INSERT INTO batches (batch_name, course_id, start_date, end_date, status)
  VALUES ('2025-2026', free_id, '2025-06-01', '2026-05-31', 'inactive')
  ON CONFLICT (batch_name, course_id) DO NOTHING;
END $$;

-- 12. Disable inactive/junk categories (DNC, TNSCVT etc.) if they exist
UPDATE course_categories
SET status = 'inactive'
WHERE category_name NOT IN ('IMR', 'TN', 'FREE')
  AND status = 'active';

-- 13. Deactivate non-master courses that have no students
UPDATE courses
SET status = 'inactive'
WHERE is_master = false
  AND status = 'active'
  AND id NOT IN (SELECT DISTINCT course_id FROM students WHERE course_id IS NOT NULL)
  AND id NOT IN (SELECT DISTINCT course_id FROM enrollments WHERE course_id IS NOT NULL);

SELECT 
  'Migration V2 complete!' AS result,
  (SELECT COUNT(*) FROM course_categories WHERE status='active') AS active_categories,
  (SELECT COUNT(*) FROM courses WHERE is_master=true)            AS master_courses,
  (SELECT COUNT(*) FROM batches WHERE batch_name='2026-2027')    AS batches_2026;
