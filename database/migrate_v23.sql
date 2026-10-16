-- Migration v23: speed up hostel history deletion and per-student payment lookups.
CREATE INDEX IF NOT EXISTS idx_hostel_payments_record_period_date
  ON hostel_payments(hostel_record_id, period_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_record_start
  ON hostel_fee_periods(hostel_record_id, start_date);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_revisions_record
  ON hostel_fee_revisions(hostel_record_id);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_schedules_record_active
  ON hostel_fee_schedules(hostel_record_id) WHERE deleted_at IS NULL;
