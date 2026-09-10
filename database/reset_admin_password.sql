-- ============================================================
-- EPFT - Admin Password Reset
-- Sets Admin@123 for admin@nalamacademy.com
-- Hash generated with bcryptjs, 10 salt rounds — verified ✅
-- ============================================================

UPDATE users
SET
    password_hash = '$2a$10$iNeOXDrGKU5ZikLGFeVleepFsJHun1WsFtRTeBNgibMnOvUMROnZ2',
    updated_at    = NOW()
WHERE
    email = 'admin@nalamacademy.com'
    AND role = 'super_admin';

-- Verify the update
SELECT id, full_name, email, role, is_active,
       LEFT(password_hash, 7) AS hash_prefix,
       updated_at
FROM users
WHERE email = 'admin@nalamacademy.com';
