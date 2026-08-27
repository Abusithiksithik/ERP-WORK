-- ============================================================
-- EPFT Nalam Academy — Migration Script
-- Run: psql -U postgres -d epft -f database/migrate.sql
-- ============================================================

-- 1. Update role constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'incharge', 'teacher', 'student'));

-- 2. Migrate existing 'faculty' → 'teacher'
UPDATE users SET role = 'teacher' WHERE role = 'faculty';

-- 3. New columns
ALTER TABLE users    ADD COLUMN IF NOT EXISTS photo_url          VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_present     BOOLEAN DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_type      VARCHAR(20) DEFAULT NULL; -- 'parent' or 'guardian'
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_10th_url      VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_12th_url      VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_diploma_url   VARCHAR(255);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='cert_10th_collected') THEN
    ALTER TABLE students ADD COLUMN cert_10th_collected    BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='cert_12th_collected') THEN
    ALTER TABLE students ADD COLUMN cert_12th_collected    BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='cert_diploma_collected') THEN
    ALTER TABLE students ADD COLUMN cert_diploma_collected BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 4. Fee columns on enrollments
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS application_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS course_fee      NUMERIC(10,2) DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS materials_fee   NUMERIC(10,2) DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='total_fee') THEN
    ALTER TABLE enrollments ADD COLUMN total_fee NUMERIC(10,2)
      GENERATED ALWAYS AS (COALESCE(application_fee,0)+COALESCE(course_fee,0)+COALESCE(materials_fee,0)) STORED;
  END IF;
END $$;

-- 5. Link payments to enrollments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL;

-- 6. Reset ALL user passwords to Admin@123
--    (same hash used in original seed.sql — verified working)
UPDATE users SET password_hash = '$2a$10$iNeOXDrGKU5ZikLGFeVleepFsJHun1WsFtRTeBNgibMnOvUMROnZ2'
WHERE role IN ('super_admin', 'admin', 'incharge', 'teacher');

-- 7. Seed staff accounts (insert if not exist)
INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES
  ('Admin User',    'admin2@nalamacademy.com',   '$2a$10$iNeOXDrGKU5ZikLGFeVleepFsJHun1WsFtRTeBNgibMnOvUMROnZ2', 'admin',    true),
  ('Incharge User', 'incharge@nalamacademy.com', '$2a$10$iNeOXDrGKU5ZikLGFeVleepFsJHun1WsFtRTeBNgibMnOvUMROnZ2', 'incharge', true),
  ('Teacher User',  'teacher@nalamacademy.com',  '$2a$10$iNeOXDrGKU5ZikLGFeVleepFsJHun1WsFtRTeBNgibMnOvUMROnZ2', 'teacher',  true)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role          = EXCLUDED.role,
      is_active     = true;

SELECT email, role, 'password: Admin@123' AS password FROM users WHERE role != 'student' ORDER BY role;
