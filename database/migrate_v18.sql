-- Migration v18: reconcile hostel fee period date columns.
-- Keeps monthly hostel periods compatible with existing databases.

ALTER TABLE hostel_fee_periods
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;

UPDATE hostel_fee_periods
SET start_date = period_from
WHERE start_date IS NULL AND period_from IS NOT NULL;

UPDATE hostel_fee_periods
SET end_date = period_to
WHERE end_date IS NULL AND period_to IS NOT NULL;

UPDATE hostel_fee_periods
SET period_from = start_date
WHERE period_from IS NULL AND start_date IS NOT NULL;

UPDATE hostel_fee_periods
SET period_to = end_date
WHERE period_to IS NULL AND end_date IS NOT NULL;

ALTER TABLE hostel_fee_periods
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_record_dates
  ON hostel_fee_periods(hostel_record_id, start_date, end_date);
