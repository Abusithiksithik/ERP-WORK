-- Migration v17: Monthly hostel/mess fee periods
-- Keeps the existing hostel_records row as the student master ledger and
-- stores each monthly/custom fee period separately.

CREATE TABLE IF NOT EXISTS hostel_fee_periods (
  id SERIAL PRIMARY KEY,
  hostel_record_id INTEGER NOT NULL REFERENCES hostel_records(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  hostel_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (hostel_fee >= 0),
  mess_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (mess_fee >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hostel_fee_period_dates_check CHECK (period_to >= period_from),
  CONSTRAINT hostel_fee_period_unique UNIQUE (student_id, period_from, period_to)
);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_student_dates
  ON hostel_fee_periods(student_id, period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_record
  ON hostel_fee_periods(hostel_record_id, period_from, period_to);

ALTER TABLE hostel_payments
  ADD COLUMN IF NOT EXISTS period_id INTEGER REFERENCES hostel_fee_periods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hostel_payments_period
  ON hostel_payments(period_id);

DROP TRIGGER IF EXISTS set_updated_at ON hostel_fee_periods;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON hostel_fee_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Backfill existing hostel records into the month in which they were created/updated.
INSERT INTO hostel_fee_periods (
  hostel_record_id, student_id, period_from, period_to,
  hostel_fee, mess_fee, discount, notes
)
SELECT
  hr.id,
  hr.student_id,
  date_trunc('month', COALESCE(hr.updated_at, hr.created_at))::date,
  (date_trunc('month', COALESCE(hr.updated_at, hr.created_at)) + INTERVAL '1 month - 1 day')::date,
  COALESCE(hr.hostel_fee, 0),
  COALESCE(hr.mess_fee, 0),
  COALESCE(hr.discount, 0),
  hr.notes
FROM hostel_records hr
ON CONFLICT (student_id, period_from, period_to) DO NOTHING;

-- Link old payments to the backfilled period when their payment date falls inside it.
UPDATE hostel_payments hp
SET period_id = hfp.id
FROM hostel_fee_periods hfp
WHERE hp.period_id IS NULL
  AND hfp.hostel_record_id = hp.hostel_record_id
  AND hp.payment_date BETWEEN hfp.period_from AND hfp.period_to;
