-- Migration v12: Course enrollment discount support
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS enrollments_discount_check;

ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_discount_check CHECK (discount >= 0);
