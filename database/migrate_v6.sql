-- ============================================================
-- Migration v6: Exam Fees Module
-- Tracked by schema_migrations — runs exactly once per database.
-- ============================================================

-- 1. Create exam_fee_records table
CREATE TABLE IF NOT EXISTS exam_fee_records (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    exam_fee    NUMERIC(10,2) DEFAULT 0 CHECK (exam_fee >= 0),
    other_fee   NUMERIC(10,2) DEFAULT 0 CHECK (other_fee >= 0),
    other_fee_note VARCHAR(200),
    paid_amount NUMERIC(10,2) DEFAULT 0 CHECK (paid_amount >= 0),
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_fee_records_student ON exam_fee_records(student_id);

-- 2. Create exam_fee_payments table
CREATE TABLE IF NOT EXISTS exam_fee_payments (
    id                 SERIAL PRIMARY KEY,
    exam_fee_record_id INTEGER NOT NULL REFERENCES exam_fee_records(id) ON DELETE CASCADE,
    student_id         INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount             NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_date       DATE DEFAULT CURRENT_DATE,
    payment_method     VARCHAR(50) DEFAULT 'cash',
    reference          VARCHAR(200),
    notes              TEXT,
    recorded_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_fee_payments_record  ON exam_fee_payments(exam_fee_record_id);
CREATE INDEX IF NOT EXISTS idx_exam_fee_payments_student ON exam_fee_payments(student_id);

-- 3. Trigger for exam_fee_records.updated_at
DROP TRIGGER IF EXISTS set_updated_at ON exam_fee_records;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON exam_fee_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
