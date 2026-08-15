-- ============================================================
-- EPFT Seed Data - Super Admin Only
-- Nalam Academy
-- ============================================================

-- Password: Admin@123  (bcrypt hash)
INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES (
    'Super Admin',
    'admin@nalamacademy.com',
    '$2a$10$iNeOXDrGKU5ZikLGFeVleepFsJHun1WsFtRTeBNgibMnOvUMROnZ2',
    'super_admin',
    true
)
ON CONFLICT (email)
DO UPDATE
SET
password_hash = EXCLUDED.password_hash;