import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// Course report: active students with stable text-formatted dates for CSV/Excel.
router.get('/course', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        s.student_id,
        s.full_name,
        s.mobile,
        s.email,
        TO_CHAR(s.date_of_birth, 'DD/MM/YYYY') AS date_of_birth,
        s.gender,
        s.address,
        s.parent_name,
        s.parent_mobile,
        s.guardian_type,
        s.parent_present,
        c.course_name,
        b.batch_name,
        TO_CHAR(s.admission_date, 'DD/MM/YYYY') AS admission_date,
        s.status
      FROM students s
      LEFT JOIN courses c ON c.id=s.course_id
      LEFT JOIN batches b ON b.id=s.batch_id
      WHERE s.status != 'discontinued'
      ORDER BY s.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /reports/course error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/enrollment', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        e.id AS enrollment_id,
        s.student_id AS student_code,
        s.full_name,
        s.mobile,
        s.email,
        cc.category_name AS master_course,
        c.course_name,
        b.batch_name,
        TO_CHAR(COALESCE(e.enrolled_at::date, s.admission_date), 'DD/MM/YYYY') AS enrollment_date,
        e.status,
        COALESCE(e.application_fee,0)::numeric AS application_fee,
        COALESCE(e.course_fee,0)::numeric AS course_fee,
        COALESCE(e.materials_fee,0)::numeric AS materials_fee,
        COALESCE(e.total_fee,0)::numeric AS total_fee,
        COALESCE(e.discount,0)::numeric AS discount,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.enrollment_id=e.id AND p.status='verified'),0)::numeric AS amount_paid,
        GREATEST(COALESCE(e.total_fee,0)-COALESCE(e.discount,0)-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.enrollment_id=e.id AND p.status='verified'),0),0)::numeric AS balance_due
      FROM enrollments e
      LEFT JOIN students s ON s.id=e.student_id
      LEFT JOIN courses c ON c.id=e.course_id
      LEFT JOIN course_categories cc ON cc.id=c.category_id
      LEFT JOIN batches b ON b.id=e.batch_id
      ORDER BY e.enrolled_at DESC, e.id DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /reports/enrollment error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/hostel', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        hr.id AS hostel_record_id,
        s.student_id AS student_code,
        s.full_name,
        s.mobile,
        s.email,
        c.course_name,
        b.batch_name,
        TO_CHAR(s.admission_date, 'DD/MM/YYYY') AS admission_date,
        COALESCE(hr.hostel_fee,0)::numeric AS hostel_fee,
        COALESCE(hr.mess_fee,0)::numeric AS mess_fee,
        (COALESCE(hr.hostel_fee,0)+COALESCE(hr.mess_fee,0))::numeric AS total_fee,
        COALESCE(hr.discount,0)::numeric AS discount,
        GREATEST(COALESCE(hr.hostel_fee,0)+COALESCE(hr.mess_fee,0)-COALESCE(hr.discount,0),0)::numeric AS net_payable,
        COALESCE(hr.paid_amount,0)::numeric AS amount_paid,
        GREATEST(COALESCE(hr.hostel_fee,0)+COALESCE(hr.mess_fee,0)-COALESCE(hr.discount,0)-COALESCE(hr.paid_amount,0),0)::numeric AS balance_due
      FROM hostel_records hr
      JOIN students s ON s.id=hr.student_id
      LEFT JOIN courses c ON c.id=s.course_id
      LEFT JOIN batches b ON b.id=s.batch_id
      WHERE s.status != 'discontinued'
      ORDER BY s.full_name ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /reports/hostel error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/exam-fee', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        s.student_id AS student_code,
        s.full_name,
        c.course_name,
        b.batch_name,
        COALESCE(efr.exam_fee,0)::numeric AS exam_fee,
        COALESCE(efr.discount,0)::numeric AS discount,
        GREATEST(COALESCE(efr.exam_fee,0)-COALESCE(efr.discount,0),0)::numeric AS net_payable,
        COALESCE(efr.paid_amount,0)::numeric AS amount_paid,
        GREATEST(COALESCE(efr.exam_fee,0)-COALESCE(efr.discount,0)-COALESCE(efr.paid_amount,0),0)::numeric AS balance_due,
        CASE
          WHEN COALESCE(efr.exam_fee,0)=0 THEN 'No Fee'
          WHEN COALESCE(efr.paid_amount,0) >= GREATEST(COALESCE(efr.exam_fee,0)-COALESCE(efr.discount,0),0) THEN 'Paid'
          WHEN COALESCE(efr.paid_amount,0) > 0 THEN 'Partial'
          ELSE 'Pending'
        END AS payment_status
      FROM exam_fee_records efr
      JOIN students s ON s.id=efr.student_id
      LEFT JOIN courses c ON c.id=s.course_id
      LEFT JOIN batches b ON b.id=s.batch_id
      WHERE s.status != 'discontinued'
      ORDER BY s.full_name ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /reports/exam-fee error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
