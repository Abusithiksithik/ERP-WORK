-- ================================================================
-- EPFT - FULL DATABASE RESET TO FRESH STATE
-- Nalam Academy
-- ----------------------------------------------------------------
-- WHAT THIS DOES:
--   Deletes ALL business/application/test data from every table.
--   Resets all serial sequences to 1.
--   Keeps: table structures, constraints, indexes, triggers.
--   Keeps: super_admin user account (admin@nalamacademy.com).
--   Keeps: payment_methods rows (non-student business config).
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- STEP 1: Delete child/dependent tables first (FK order)
-- ----------------------------------------------------------------

-- New Admissions references students with ON DELETE RESTRICT, so remove entries first.
DELETE FROM new_admissions;

-- Video watch progress (depends on students + lms_videos)
DELETE FROM video_progress;

-- Attendance records (depends on students + batches)
DELETE FROM attendance;

-- Payments (depends on students + enrollments + payment_methods)
DELETE FROM payments;

-- Enrollments (depends on students + courses + batches)
DELETE FROM enrollments;

-- LMS Materials (depends on courses + lms_modules)
DELETE FROM lms_materials;

-- LMS Videos (depends on courses + lms_modules)
DELETE FROM lms_videos;

-- LMS Modules (depends on courses)
DELETE FROM lms_modules;

-- ----------------------------------------------------------------
-- STEP 2: Delete faculty profile rows + their user accounts
-- ----------------------------------------------------------------

-- Remove faculty profiles first (references users.id)
DELETE FROM faculty;

-- Remove faculty user accounts
DELETE FROM users WHERE role = 'faculty';

-- ----------------------------------------------------------------
-- STEP 3: Delete students + their user accounts
-- ----------------------------------------------------------------

-- Remove student records (has FK to users, courses, batches)
DELETE FROM students;

-- Remove student user accounts
DELETE FROM users WHERE role = 'student';

-- ----------------------------------------------------------------
-- STEP 4: Delete batches, courses, categories
-- ----------------------------------------------------------------

-- Batches reference courses
DELETE FROM batches;

-- Courses reference course_categories
DELETE FROM courses;

-- Categories stand alone
DELETE FROM course_categories;

-- ----------------------------------------------------------------
-- STEP 5: Reset all sequences to 1 for clean IDs
-- ----------------------------------------------------------------

ALTER SEQUENCE new_admissions_id_seq    RESTART WITH 1;
ALTER SEQUENCE video_progress_id_seq     RESTART WITH 1;
ALTER SEQUENCE attendance_id_seq         RESTART WITH 1;
ALTER SEQUENCE payments_id_seq           RESTART WITH 1;
ALTER SEQUENCE enrollments_id_seq        RESTART WITH 1;
ALTER SEQUENCE lms_materials_id_seq      RESTART WITH 1;
ALTER SEQUENCE lms_videos_id_seq         RESTART WITH 1;
ALTER SEQUENCE lms_modules_id_seq        RESTART WITH 1;
ALTER SEQUENCE faculty_id_seq            RESTART WITH 1;
ALTER SEQUENCE students_id_seq           RESTART WITH 1;
ALTER SEQUENCE batches_id_seq            RESTART WITH 1;
ALTER SEQUENCE courses_id_seq            RESTART WITH 1;
ALTER SEQUENCE course_categories_id_seq  RESTART WITH 1;

-- Reset users sequence to next value after existing admin rows
SELECT setval('users_id_seq', COALESCE(MAX(id), 1)) FROM users;

-- ----------------------------------------------------------------
-- STEP 6: Verify — all business tables must show 0 rows
-- ----------------------------------------------------------------

SELECT
    'video_progress'    AS table_name, COUNT(*) AS rows FROM video_progress
UNION ALL SELECT 'attendance',         COUNT(*) FROM attendance
UNION ALL SELECT 'payments',           COUNT(*) FROM payments
UNION ALL SELECT 'enrollments',        COUNT(*) FROM enrollments
UNION ALL SELECT 'lms_materials',      COUNT(*) FROM lms_materials
UNION ALL SELECT 'lms_videos',         COUNT(*) FROM lms_videos
UNION ALL SELECT 'lms_modules',        COUNT(*) FROM lms_modules
UNION ALL SELECT 'faculty',            COUNT(*) FROM faculty
UNION ALL SELECT 'students',           COUNT(*) FROM students
UNION ALL SELECT 'batches',            COUNT(*) FROM batches
UNION ALL SELECT 'courses',            COUNT(*) FROM courses
UNION ALL SELECT 'course_categories',  COUNT(*) FROM course_categories
UNION ALL SELECT '--- ADMIN KEPT ---', 0
UNION ALL SELECT 'users (total)',       COUNT(*) FROM users
UNION ALL SELECT 'users (super_admin)', COUNT(*) FROM users WHERE role = 'super_admin';

COMMIT;
