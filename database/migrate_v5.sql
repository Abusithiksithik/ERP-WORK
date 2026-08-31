-- ============================================================
-- Migration v5: Hostel Module
-- Tracked by schema_migrations — runs exactly once per database.
-- ============================================================

-- 1. Add accommodation_type to students
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS accommodation_type VARCHAR(20)
  DEFAULT 'day_scholar';

-- Add/ensure the CHECK constraint (named, so it can be safely ensured)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_accommodation_type_check'
      AND conrelid = 'students'::regclass
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_accommodation_type_check
      CHECK (accommodation_type IN ('day_scholar', 'hostel'));
  END IF;
END $$;

-- 2. Create hostel_records table
CREATE TABLE IF NOT EXISTS hostel_records (
    id         SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    hostel_fee NUMERIC(10,2) DEFAULT 0 CHECK (hostel_fee >= 0),
    mess_fee   NUMERIC(10,2) DEFAULT 0 CHECK (mess_fee   >= 0),
    paid_amount NUMERIC(10,2) DEFAULT 0 CHECK (paid_amount >= 0),
    notes      TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hostel_records_student ON hostel_records(student_id);

-- 3. Create hostel_payments table
CREATE TABLE IF NOT EXISTS hostel_payments (
    id               SERIAL PRIMARY KEY,
    hostel_record_id INTEGER NOT NULL REFERENCES hostel_records(id) ON DELETE CASCADE,
    student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_date     DATE DEFAULT CURRENT_DATE,
    payment_method   VARCHAR(50) DEFAULT 'cash',
    reference        VARCHAR(200),
    notes            TEXT,
    recorded_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hostel_payments_record  ON hostel_payments(hostel_record_id);
CREATE INDEX IF NOT EXISTS idx_hostel_payments_student ON hostel_payments(student_id);

-- 4. Trigger for hostel_records.updated_at
DROP TRIGGER IF EXISTS set_updated_at ON hostel_records;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON hostel_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
