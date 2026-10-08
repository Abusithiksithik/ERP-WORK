-- Migration v17: canonical monthly hostel/mess fee periods.
-- Safe to re-run on databases that already have the legacy period_from/period_to
-- columns or the later start_date/end_date columns.
CREATE TABLE IF NOT EXISTS hostel_fee_periods (
  id SERIAL PRIMARY KEY,
  hostel_record_id INTEGER NOT NULL REFERENCES hostel_records(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period_from DATE,
  period_to DATE,
  start_date DATE,
  end_date DATE,
  hostel_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (hostel_fee >= 0),
  mess_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (mess_fee >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS period_from DATE;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS period_to DATE;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE hostel_fee_periods
SET start_date = COALESCE(start_date, period_from, date_trunc('month', COALESCE(created_at, NOW()))::date),
    end_date = COALESCE(end_date, period_to, (date_trunc('month', COALESCE(created_at, NOW())) + INTERVAL '1 month - 1 day')::date)
WHERE start_date IS NULL OR end_date IS NULL;

UPDATE hostel_fee_periods
SET period_from = COALESCE(period_from, start_date),
    period_to = COALESCE(period_to, end_date)
WHERE period_from IS NULL OR period_to IS NULL;

ALTER TABLE hostel_fee_periods ALTER COLUMN period_from SET NOT NULL;
ALTER TABLE hostel_fee_periods ALTER COLUMN period_to SET NOT NULL;
ALTER TABLE hostel_fee_periods ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE hostel_fee_periods ALTER COLUMN end_date SET NOT NULL;

ALTER TABLE hostel_fee_periods DROP CONSTRAINT IF EXISTS hostel_fee_period_dates_check;
ALTER TABLE hostel_fee_periods
  ADD CONSTRAINT hostel_fee_period_dates_check CHECK (period_to >= period_from);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hostel_fee_period_unique
  ON hostel_fee_periods(hostel_record_id, period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_student_dates
  ON hostel_fee_periods(student_id, period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_record_dates
  ON hostel_fee_periods(hostel_record_id, start_date, end_date);

ALTER TABLE hostel_payments
  ADD COLUMN IF NOT EXISTS period_id INTEGER REFERENCES hostel_fee_periods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hostel_payments_period
  ON hostel_payments(period_id);

DROP TRIGGER IF EXISTS set_updated_at ON hostel_fee_periods;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON hostel_fee_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Backfill periods for existing hostel records when no period exists yet.
INSERT INTO hostel_fee_periods (
  hostel_record_id, student_id, period_from, period_to, start_date, end_date,
  hostel_fee, mess_fee, discount, notes
)
SELECT
  hr.id,
  hr.student_id,
  date_trunc('month', COALESCE(hr.updated_at, hr.created_at))::date,
  (date_trunc('month', COALESCE(hr.updated_at, hr.created_at)) + INTERVAL '1 month - 1 day')::date,
  date_trunc('month', COALESCE(hr.updated_at, hr.created_at))::date,
  (date_trunc('month', COALESCE(hr.updated_at, hr.created_at)) + INTERVAL '1 month - 1 day')::date,
  COALESCE(hr.hostel_fee, 0),
  COALESCE(hr.mess_fee, 0),
  COALESCE(hr.discount, 0),
  hr.notes
FROM hostel_records hr
WHERE NOT EXISTS (
  SELECT 1 FROM hostel_fee_periods hfp
  WHERE hfp.hostel_record_id = hr.id
    AND hfp.period_from = date_trunc('month', COALESCE(hr.updated_at, hr.created_at))::date
    AND hfp.period_to = (date_trunc('month', COALESCE(hr.updated_at, hr.created_at)) + INTERVAL '1 month - 1 day')::date
);

UPDATE hostel_payments hp
SET period_id = hfp.id
FROM hostel_fee_periods hfp
WHERE hp.period_id IS NULL
  AND hfp.hostel_record_id = hp.hostel_record_id
  AND hp.payment_date BETWEEN hfp.period_from AND hfp.period_to;
