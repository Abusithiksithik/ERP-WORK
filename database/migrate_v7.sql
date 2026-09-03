-- migrate_v7.sql: Fix attendance module
-- 1. Add updated_at column to attendance table (fixes trigger error)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Update status CHECK constraint to only allow present/absent
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present', 'absent'));

-- 3. Normalize any existing late/excused records to absent
UPDATE attendance SET status = 'absent' WHERE status IN ('late', 'excused');

-- 4. Ensure the trigger is applied to attendance (now that updated_at exists)
DROP TRIGGER IF EXISTS set_updated_at ON attendance;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Done
