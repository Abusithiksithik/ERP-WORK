-- ============================================================
-- EPFT Seed Data
-- ============================================================
INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES
  ('Admin',         'admin@nalamacademy.com',     '$2a$10$iNeOXDrGKU5ZikLGFeVleepFsJHun1WsFtRTeBNgibMnOvUMROnZ2', 'admin',    true),
  ('Incharge User', 'incharge@nalamacademy.com',  '$2a$10$iNeOXDrGKU5ZikLGFeVleepFsJHun1WsFtRTeBNgibMnOvUMROnZ2', 'incharge', true),
  ('Teacher User',  'teacher@nalamacademy.com',   '$2a$10$iNeOXDrGKU5ZikLGFeVleepFsJHun1WsFtRTeBNgibMnOvUMROnZ2', 'teacher',  true)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role          = EXCLUDED.role,
      is_active     = true;
