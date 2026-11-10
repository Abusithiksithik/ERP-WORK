-- PostgreSQL-backed durable assets for profile/student photos and certificates.
-- Deliberately no foreign keys to users/students: deleting a record must not delete its files.
BEGIN;
CREATE TABLE IF NOT EXISTS file_assets (
  id BIGSERIAL PRIMARY KEY,
  category VARCHAR(40) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_file_assets_category_created
  ON file_assets(category, created_at DESC);
COMMIT;
