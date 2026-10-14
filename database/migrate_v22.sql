-- Migration v22: prevent duplicate hostel fee schedules while preserving payment history.
CREATE TABLE IF NOT EXISTS hostel_fee_schedules (
  id BIGSERIAL PRIMARY KEY,
  hostel_record_id INTEGER NOT NULL REFERENCES hostel_records(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_schedules_active_range
  ON hostel_fee_schedules(hostel_record_id, start_date, end_date)
  WHERE deleted_at IS NULL;
