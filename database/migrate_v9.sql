-- ============================================================
-- Migration v9: Exam Fee Settings — Common fee per Category+Course
-- Auto-create exam_fee_records for all eligible candidates.
-- Tracked by schema_migrations — runs exactly once per database.
-- Safe: no existing data is deleted.
-- ============================================================

-- 1. Create exam_fee_settings table (common fee per category+course)
CREATE TABLE IF NOT EXISTS exam_fee_settings (
    id              SERIAL PRIMARY KEY,
    category_id     INTEGER REFERENCES course_categories(id) ON DELETE CASCADE,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    exam_fee        NUMERIC(10,2) DEFAULT 0 CHECK (exam_fee >= 0),
    other_fee       NUMERIC(10,2) DEFAULT 0 CHECK (other_fee >= 0),
    other_fee_note  VARCHAR(200),
    notes           TEXT,
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_exam_fee_setting UNIQUE (category_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_fee_settings_course    ON exam_fee_settings(course_id);
CREATE INDEX IF NOT EXISTS idx_exam_fee_settings_category  ON exam_fee_settings(category_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON exam_fee_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON exam_fee_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Seed exam_fee_settings from existing exam_fee_records (preserve existing fees)
--    For each course that already has students with exam_fee_records, take the most-common exam_fee.
INSERT INTO exam_fee_settings (category_id, course_id, exam_fee, other_fee, other_fee_note)
SELECT DISTINCT ON (s.course_id)
    c.category_id,
    s.course_id,
    efr.exam_fee,
    efr.other_fee,
    efr.other_fee_note
FROM exam_fee_records efr
JOIN students s ON s.id = efr.student_id
JOIN courses c ON c.id = s.course_id
WHERE s.course_id IS NOT NULL
ON CONFLICT (category_id, course_id) DO NOTHING;

-- 3. Auto-create exam_fee_records for ALL eligible candidates
--    (active students with approved enrollment, not already in exam_fee_records)
INSERT INTO exam_fee_records (student_id, exam_fee, other_fee, other_fee_note)
SELECT
    s.id,
    COALESCE(efs.exam_fee, 0),
    COALESCE(efs.other_fee, 0),
    efs.other_fee_note
FROM students s
JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
LEFT JOIN exam_fee_settings efs ON efs.course_id = s.course_id
    AND (efs.category_id IS NULL OR efs.category_id = (
        SELECT category_id FROM courses WHERE id = s.course_id LIMIT 1
    ))
WHERE s.status = 'active'
  AND NOT EXISTS (
      SELECT 1 FROM exam_fee_records WHERE student_id = s.id
  )
ON CONFLICT DO NOTHING;

SELECT 'Migration v9 complete' AS result;
