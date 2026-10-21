-- Required schema for Hostel monthly History Delete / Add New.
-- Run once against the same PostgreSQL database used by the ERP backend.
-- This migration is additive and preserves existing hostel/payment rows.
BEGIN;

CREATE TABLE IF NOT EXISTS hostel_fee_periods (
  id SERIAL PRIMARY KEY,
  hostel_record_id INTEGER NOT NULL REFERENCES hostel_records(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hostel_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (hostel_fee >= 0),
  mess_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (mess_fee >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hostel_fee_period_dates_check CHECK (period_to >= period_from),
  CONSTRAINT hostel_fee_period_start_end_check CHECK (end_date >= start_date)
);

ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS period_from DATE;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS period_to DATE;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS hostel_fee NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS mess_fee NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE hostel_fee_periods ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Repair missing period dates for rows if a previous partial migration created the table.
UPDATE hostel_fee_periods
SET start_date = COALESCE(start_date, period_from, date_trunc('month', created_at)::date),
    end_date = COALESCE(end_date, period_to, (date_trunc('month', created_at) + INTERVAL '1 month - 1 day')::date),
    period_from = COALESCE(period_from, start_date, date_trunc('month', created_at)::date),
    period_to = COALESCE(period_to, end_date, (date_trunc('month', created_at) + INTERVAL '1 month - 1 day')::date)
WHERE start_date IS NULL OR end_date IS NULL OR period_from IS NULL OR period_to IS NULL;

ALTER TABLE hostel_fee_periods ALTER COLUMN period_from SET NOT NULL;
ALTER TABLE hostel_fee_periods ALTER COLUMN period_to SET NOT NULL;
ALTER TABLE hostel_fee_periods ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE hostel_fee_periods ALTER COLUMN end_date SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hostel_fee_period_unique
  ON hostel_fee_periods(hostel_record_id, period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_record_dates
  ON hostel_fee_periods(hostel_record_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_hostel_fee_periods_active_record_dates
  ON hostel_fee_periods(hostel_record_id, start_date, end_date) WHERE is_deleted = FALSE;

ALTER TABLE hostel_payments ADD COLUMN IF NOT EXISTS period_id INTEGER REFERENCES hostel_fee_periods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hostel_payments_period ON hostel_payments(period_id);

-- Seed a period from each existing hostel record without changing its existing values.
-- Historical month-level fees cannot be reconstructed from the legacy single-record table;
-- this seeds the record's last-updated month and preserves payment rows.
INSERT INTO hostel_fee_periods (
  hostel_record_id, student_id, period_from, period_to, start_date, end_date,
  hostel_fee, mess_fee, discount, notes
)
SELECT hr.id, hr.student_id,
       date_trunc('month', COALESCE(hr.updated_at, hr.created_at, NOW()))::date,
       (date_trunc('month', COALESCE(hr.updated_at, hr.created_at, NOW())) + INTERVAL '1 month - 1 day')::date,
       date_trunc('month', COALESCE(hr.updated_at, hr.created_at, NOW()))::date,
       (date_trunc('month', COALESCE(hr.updated_at, hr.created_at, NOW())) + INTERVAL '1 month - 1 day')::date,
       COALESCE(hr.hostel_fee, 0), COALESCE(hr.mess_fee, 0), COALESCE(hr.discount, 0), hr.notes
FROM hostel_records hr
WHERE NOT EXISTS (
  SELECT 1 FROM hostel_fee_periods fp
  WHERE fp.hostel_record_id = hr.id
    AND fp.period_from = date_trunc('month', COALESCE(hr.updated_at, hr.created_at, NOW()))::date
);

-- Attach legacy payments to a period only when their payment date falls inside it.
UPDATE hostel_payments hp
SET period_id = fp.id
FROM hostel_fee_periods fp
WHERE hp.period_id IS NULL
  AND hp.hostel_record_id = fp.hostel_record_id
  AND hp.payment_date BETWEEN fp.start_date AND fp.end_date;

COMMIT;
