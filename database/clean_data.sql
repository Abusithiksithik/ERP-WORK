-- ============================================================
-- EPFT - Clean All Student Data (Fresh Start)
-- Nalam Academy
-- Tables & Columns are PRESERVED. Only data is deleted.
-- Super Admin account is also preserved.
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Delete dependent child tables first (foreign key order)
-- ----------------------------------------------------------------

-- Video progress (depends on students & videos)
DELETE FROM video_progress;

-- Attendance (depends on students)
DELETE FROM attendance;

-- Payments (depends on students & enrollments)
DELETE FROM payments;

-- Enrollments (depends on students & courses)
DELETE FROM enrollments;

-- ----------------------------------------------------------------
-- 2. Delete student user accounts from users table
-- ----------------------------------------------------------------

-- Remove users that are linked to students (role = 'student')
DELETE FROM users
WHERE role = 'student';

-- ----------------------------------------------------------------
-- 3. Delete all students
-- ----------------------------------------------------------------

DELETE FROM students;

-- ----------------------------------------------------------------
-- 4. Reset sequences so IDs start fresh
-- ----------------------------------------------------------------

-- Reset students serial ID
ALTER SEQUENCE students_id_seq RESTART WITH 1;

-- Reset student-related serial IDs
ALTER SEQUENCE enrollments_id_seq  RESTART WITH 1;
ALTER SEQUENCE payments_id_seq     RESTART WITH 1;
ALTER SEQUENCE attendance_id_seq   RESTART WITH 1;
ALTER SEQUENCE video_progress_id_seq RESTART WITH 1;

-- Reset users sequence (admin will keep its original ID but new users start after)
-- Safe approach: set sequence to max(id)+1
SELECT setval('users_id_seq', COALESCE(MAX(id), 1)) FROM users;

-- ----------------------------------------------------------------
-- 5. Verification queries (check counts after cleanup)
-- ----------------------------------------------------------------

SELECT 'students'            AS table_name, COUNT(*) AS remaining_rows FROM students
UNION ALL
SELECT 'enrollments',        COUNT(*) FROM enrollments
UNION ALL
SELECT 'payments',           COUNT(*) FROM payments
UNION ALL
SELECT 'attendance',         COUNT(*) FROM attendance
UNION ALL
SELECT 'video_progress',     COUNT(*) FROM video_progress
UNION ALL
SELECT 'users (admin only)', COUNT(*) FROM users;

COMMIT;
