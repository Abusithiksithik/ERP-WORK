-- Migration v21: auditable hostel fee revisions. Existing fees/payments are preserved.
CREATE TABLE IF NOT EXISTS hostel_fee_revisions (
  id BIGSERIAL PRIMARY KEY,
  hostel_record_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NOT NULL,
  previous_hostel_fee NUMERIC(12,2),
  previous_mess_fee NUMERIC(12,2),
  new_hostel_fee NUMERIC(12,2) NOT NULL,
  new_mess_fee NUMERIC(12,2) NOT NULL,
  changed_by INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hostel_fee_revisions_record_effective
  ON hostel_fee_revisions(hostel_record_id, effective_from, created_at);
