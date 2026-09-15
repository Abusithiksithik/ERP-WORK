-- Migration v15: Admission Source Master
CREATE TABLE IF NOT EXISTS admission_sources (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(50) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO admission_sources (source_name)
VALUES
  ('TV Ads'),
  ('Friend Referral'),
  ('Sir Referral'),
  ('Social Media'),
  ('Individual')
ON CONFLICT (source_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_admission_sources_active
  ON admission_sources(is_active, source_name);
