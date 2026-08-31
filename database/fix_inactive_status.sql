-- ================================================================
-- FIX: Set Nisha Devi (STU-SAMPLE-05) to inactive for testing
-- Run this once in your DB:
--   psql -U postgres -d epft -f fix_inactive_status.sql
-- ================================================================

UPDATE students 
SET status = 'inactive' 
WHERE email = 'nisha.sample05@example.com';

-- Verify
SELECT student_id, full_name, status 
FROM students 
ORDER BY student_id;
