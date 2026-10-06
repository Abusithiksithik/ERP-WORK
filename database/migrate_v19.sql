-- Migration v19: repair/normalise monthly hostel fee period dates.
-- Safe for existing databases that contain both legacy period_from/period_to
-- and the canonical start_date/end_date columns.

UPDATE hostel_fee_periods
SET start_date = COALESCE(
  start_date,
  period_from,
  date_trunc('month', COALESCE(created_at, NOW()))::date
)
WHERE start_date IS NULL;

UPDATE hostel_fee_periods
SET end_date = COALESCE(
  end_date,
  period_to,
  (date_trunc('month', COALESCE(created_at, NOW())) + INTERVAL '1 month - 1 day')::date
)
WHERE end_date IS NULL;

UPDATE hostel_fee_periods
SET period_from = start_date
WHERE period_from IS NULL AND start_date IS NOT NULL;

UPDATE hostel_fee_periods
SET period_to = end_date
WHERE period_to IS NULL AND end_date IS NOT NULL;

ALTER TABLE hostel_fee_periods
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_record_dates_v19
  ON hostel_fee_periods(hostel_record_id, start_date, end_date);
