-- Migration v10: Per-student discount

ALTER TABLE public.exam_fee_records
ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2)
DEFAULT 0
CHECK (discount >= 0);

ALTER TABLE public.hostel_records
ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2)
NOT NULL
DEFAULT 0;