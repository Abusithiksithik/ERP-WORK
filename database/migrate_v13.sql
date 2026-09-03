-- Migration v13: Production schema repair + performance safeguards
-- Idempotent and safe to run on existing deployments.

-- Candidates may omit email.
ALTER TABLE students
  ALTER COLUMN email DROP NOT NULL;

-- Payment methods are required by the existing course-payment module.
CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    method_type VARCHAR(20) NOT NULL CHECK (method_type IN ('bank', 'upi', 'cash')),
    account_holder_name VARCHAR(150),
    bank_name VARCHAR(150),
    account_number VARCHAR(50),
    ifsc_code VARCHAR(20),
    upi_id VARCHAR(100),
    qr_image_url VARCHAR(255),
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_enabled ON payment_methods(is_enabled);

-- Course enrollment fee fields used by the existing enrollment/payment UI.
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS application_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS course_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS materials_fee NUMERIC(10,2) DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='enrollments' AND column_name='total_fee') THEN
    ALTER TABLE enrollments ADD COLUMN total_fee NUMERIC(10,2)
      GENERATED ALWAYS AS (COALESCE(application_fee,0)+COALESCE(course_fee,0)+COALESCE(materials_fee,0)) STORED;
  END IF;
END $$;

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_discount_check;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_discount_check CHECK (discount >= 0);

-- Repair V10 discount columns if an older deployment marked V10 applied
-- before all schema changes reached the database.
CREATE TABLE IF NOT EXISTS hostel_records (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    hostel_fee NUMERIC(10,2) DEFAULT 0 CHECK (hostel_fee >= 0),
    mess_fee NUMERIC(10,2) DEFAULT 0 CHECK (mess_fee >= 0),
    paid_amount NUMERIC(10,2) DEFAULT 0 CHECK (paid_amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hostel_payments (
    id SERIAL PRIMARY KEY,
    hostel_record_id INTEGER NOT NULL REFERENCES hostel_records(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_date DATE DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) DEFAULT 'cash',
    reference VARCHAR(200),
    notes TEXT,
    recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS exam_fee_records (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    exam_fee NUMERIC(10,2) DEFAULT 0 CHECK (exam_fee >= 0),
    other_fee NUMERIC(10,2) DEFAULT 0 CHECK (other_fee >= 0),
    other_fee_note VARCHAR(200),
    paid_amount NUMERIC(10,2) DEFAULT 0 CHECK (paid_amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS exam_fee_payments (
    id SERIAL PRIMARY KEY,
    exam_fee_record_id INTEGER NOT NULL REFERENCES exam_fee_records(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_date DATE DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) DEFAULT 'cash',
    reference VARCHAR(200),
    notes TEXT,
    recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE exam_fee_records
  ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE exam_fee_records DROP CONSTRAINT IF EXISTS exam_fee_records_discount_check;
ALTER TABLE exam_fee_records
  ADD CONSTRAINT exam_fee_records_discount_check CHECK (discount >= 0);
ALTER TABLE hostel_records
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE hostel_records DROP CONSTRAINT IF EXISTS hostel_records_discount_check;
ALTER TABLE hostel_records
  ADD CONSTRAINT hostel_records_discount_check CHECK (discount >= 0);
DROP TRIGGER IF EXISTS set_updated_at ON hostel_records;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON hostel_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON exam_fee_records;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON exam_fee_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- New Admissions must have an updated_at trigger like the other mutable tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='new_admissions') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON new_admissions;
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON new_admissions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Important indexes for payment/enrollment lookups under concurrent use.
CREATE INDEX IF NOT EXISTS idx_payments_enrollment_status
  ON payments(enrollment_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_status
  ON enrollments(student_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_batch
  ON enrollments(course_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date
  ON attendance(student_id, attendance_date);

SELECT 'Migration v13 complete' AS result;
