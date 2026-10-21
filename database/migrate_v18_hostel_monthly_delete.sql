-- Migration v18: soft-delete individual hostel fee months without destroying payment audit history.
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_active_record_dates
  ON hostel_fee_periods(hostel_record_id, start_date, end_date) WHERE is_deleted = FALSE;
