-- ============================================================
-- EPFT Nalam Academy — Sample Student Seed Data
-- 5 idempotent sample students with enrollments and payments
-- Run after migrate_v2.sql
-- ============================================================

DO $$
DECLARE
  imr_course_id  INTEGER;
  tn_course_id   INTEGER;
  free_course_id INTEGER;
  imr_batch_id   INTEGER;
  tn_batch_id    INTEGER;
  free_batch_id  INTEGER;
  admin_user_id  INTEGER;
  
  -- student IDs
  s1_id  INTEGER;
  s2_id  INTEGER;
  s3_id  INTEGER;
  s4_id  INTEGER;
  s5_id  INTEGER;
  
  -- enrollment IDs
  e1_id  INTEGER;
  e2_id  INTEGER;
  e3_id  INTEGER;
  e4_id  INTEGER;
  e5_id  INTEGER;

BEGIN
  -- Get course and batch IDs
  SELECT id INTO imr_course_id  FROM courses WHERE course_name = 'IMR'  AND is_master = true LIMIT 1;
  SELECT id INTO tn_course_id   FROM courses WHERE course_name = 'TN'   AND is_master = true LIMIT 1;
  SELECT id INTO free_course_id FROM courses WHERE course_name = 'FREE' AND is_master = true LIMIT 1;

  SELECT id INTO imr_batch_id  FROM batches WHERE batch_name = '2026-2027' AND course_id = imr_course_id  LIMIT 1;
  SELECT id INTO tn_batch_id   FROM batches WHERE batch_name = '2026-2027' AND course_id = tn_course_id   LIMIT 1;
  SELECT id INTO free_batch_id FROM batches WHERE batch_name = '2026-2027' AND course_id = free_course_id LIMIT 1;

  SELECT id INTO admin_user_id FROM users WHERE email = 'admin@nalamacademy.com' LIMIT 1;

  -- ── Student 1: Arjun Kumar — IMR, ₹5,000 paid ──────────────────────
  IF NOT EXISTS (SELECT 1 FROM students WHERE email = 'arjun.sample01@example.com') THEN
    INSERT INTO students (
      student_id, full_name, mobile, email, gender,
      course_id, batch_id, admission_date, status
    ) VALUES (
      'STU-SAMPLE-01', 'Arjun Kumar', '9876543210', 'arjun.sample01@example.com', 'Male',
      imr_course_id, imr_batch_id, CURRENT_DATE, 'active'
    ) RETURNING id INTO s1_id;

    INSERT INTO enrollments (student_id, course_id, batch_id, course_fee, status, approved_by, approved_at)
    VALUES (s1_id, imr_course_id, imr_batch_id, 25000, 'approved', admin_user_id, NOW())
    RETURNING id INTO e1_id;

    UPDATE students SET course_id = imr_course_id, batch_id = imr_batch_id WHERE id = s1_id;

    INSERT INTO payments (student_id, enrollment_id, amount, payment_date, payment_type, status, notes, verified_by, verified_at)
    VALUES (s1_id, e1_id, 5000, CURRENT_DATE, 'initial', 'verified', 'Initial payment at admission', admin_user_id, NOW());
  END IF;

  -- ── Student 2: Priya S — TN, ₹10,000 paid ──────────────────────────
  IF NOT EXISTS (SELECT 1 FROM students WHERE email = 'priya.sample02@example.com') THEN
    INSERT INTO students (
      student_id, full_name, mobile, email, gender,
      course_id, batch_id, admission_date, status
    ) VALUES (
      'STU-SAMPLE-02', 'Priya S', '9876543211', 'priya.sample02@example.com', 'Female',
      tn_course_id, tn_batch_id, CURRENT_DATE, 'active'
    ) RETURNING id INTO s2_id;

    INSERT INTO enrollments (student_id, course_id, batch_id, course_fee, status, approved_by, approved_at)
    VALUES (s2_id, tn_course_id, tn_batch_id, 25000, 'approved', admin_user_id, NOW())
    RETURNING id INTO e2_id;

    UPDATE students SET course_id = tn_course_id, batch_id = tn_batch_id WHERE id = s2_id;

    -- Two payments totaling ₹10,000
    INSERT INTO payments (student_id, enrollment_id, amount, payment_date, payment_type, status, notes, verified_by, verified_at)
    VALUES 
      (s2_id, e2_id, 5000,  CURRENT_DATE - 30, 'initial',  'verified', 'Initial payment at admission', admin_user_id, NOW()),
      (s2_id, e2_id, 5000,  CURRENT_DATE,       'course_fee','verified', 'Second installment',          admin_user_id, NOW());
  END IF;

  -- ── Student 3: Mohammed Ali — IMR, ₹0 paid (Pay Later) ─────────────
  IF NOT EXISTS (SELECT 1 FROM students WHERE email = 'mohammed.sample03@example.com') THEN
    INSERT INTO students (
      student_id, full_name, mobile, email, gender,
      course_id, batch_id, admission_date, status
    ) VALUES (
      'STU-SAMPLE-03', 'Mohammed Ali', '9876543212', 'mohammed.sample03@example.com', 'Male',
      imr_course_id, imr_batch_id, CURRENT_DATE, 'active'
    ) RETURNING id INTO s3_id;

    INSERT INTO enrollments (student_id, course_id, batch_id, course_fee, status, notes, approved_by, approved_at)
    VALUES (s3_id, imr_course_id, imr_batch_id, 25000, 'approved', 'Pay Later — no initial payment', admin_user_id, NOW())
    RETURNING id INTO e3_id;

    UPDATE students SET course_id = imr_course_id, batch_id = imr_batch_id WHERE id = s3_id;
    -- No payment record — pay later
  END IF;

  -- ── Student 4: Kavya R — TN, ₹5,000 paid + Internship Plan ─────────
  IF NOT EXISTS (SELECT 1 FROM students WHERE email = 'kavya.sample04@example.com') THEN
    INSERT INTO students (
      student_id, full_name, mobile, email, gender,
      course_id, batch_id, admission_date, status
    ) VALUES (
      'STU-SAMPLE-04', 'Kavya R', '9876543213', 'kavya.sample04@example.com', 'Female',
      tn_course_id, tn_batch_id, CURRENT_DATE, 'active'
    ) RETURNING id INTO s4_id;

    INSERT INTO enrollments (student_id, course_id, batch_id, course_fee, status, notes, approved_by, approved_at)
    VALUES (s4_id, tn_course_id, tn_batch_id, 25000, 'approved',
            'Internship Plan: ₹5,000 x 4 months = ₹20,000 (plan only — not actual payment)',
            admin_user_id, NOW())
    RETURNING id INTO e4_id;

    UPDATE students SET course_id = tn_course_id, batch_id = tn_batch_id WHERE id = s4_id;

    -- Only actual payment: ₹5,000 initial
    INSERT INTO payments (student_id, enrollment_id, amount, payment_date, payment_type, status, notes, verified_by, verified_at)
    VALUES (s4_id, e4_id, 5000, CURRENT_DATE, 'initial', 'verified', 'Initial payment — internship plan: ₹5,000×4 months planned (NOT actual payment)', admin_user_id, NOW());
  END IF;

  -- ── Student 5: Nisha Devi — FREE course, ₹0 ──────────────────────────
  IF NOT EXISTS (SELECT 1 FROM students WHERE email = 'nisha.sample05@example.com') THEN
    INSERT INTO students (
      student_id, full_name, mobile, email, gender,
      course_id, batch_id, admission_date, status
    ) VALUES (
      'STU-SAMPLE-05', 'Nisha Devi', '9876543214', 'nisha.sample05@example.com', 'Female',
      free_course_id, free_batch_id, CURRENT_DATE, 'active'
    ) RETURNING id INTO s5_id;

    INSERT INTO enrollments (student_id, course_id, batch_id, course_fee, status, approved_by, approved_at)
    VALUES (s5_id, free_course_id, free_batch_id, 0, 'approved', admin_user_id, NOW())
    RETURNING id INTO e5_id;

    UPDATE students SET course_id = free_course_id, batch_id = free_batch_id WHERE id = s5_id;
    -- No payment — free course
  END IF;

  -- ── Fix status for already-seeded students ──────────────────────────
  -- Nisha Devi → inactive (for testing inactive filter)
  -- UPDATE students SET status = 'inactive' WHERE email = 'nisha.sample05@example.com';

END $$;

SELECT
  s.student_id,
  s.full_name,
  c.course_name,
  c.fee_amount AS course_fee,
  COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.id AND p.status = 'verified'), 0) AS total_paid,
  c.fee_amount - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.id AND p.status = 'verified'), 0) AS balance,
  s.status
FROM students s
LEFT JOIN courses c ON c.id = s.course_id
WHERE s.email LIKE '%.sample0%@example.com'
ORDER BY s.student_id;
