-- Dashboard-only configuration: government-approved seat count per batch.
-- Existing academic and student data is not modified.
CREATE TABLE IF NOT EXISTS dashboard_batch_seats (
  batch_id INTEGER PRIMARY KEY REFERENCES batches(id) ON DELETE CASCADE,
  approved_seats INTEGER NOT NULL DEFAULT 0 CHECK (approved_seats >= 0),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
