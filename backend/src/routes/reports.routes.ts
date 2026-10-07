import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

router.get('/course', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        s.student_id,
        s.full_name,
        s.mobile,
        c.course_name,
        b.batch_name,
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
        COALESCE(e.course_fee,0)::numeric AS course_fee,
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
        c.course_name,
        b.batch_name,
        TO_CHAR(s.admission_date, 'DD/MM/YYYY') AS admission_date,
        COALESCE(fp.hostel_fee,0)::numeric AS hostel_fee,
        COALESCE(fp.mess_fee,0)::numeric AS mess_fee,
        (COALESCE(fp.hostel_fee,0)+COALESCE(fp.mess_fee,0))::numeric AS total_fee,
        COALESCE(fp.discount,0)::numeric AS discount,
        COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id),0)::numeric AS amount_paid,
        GREATEST(
          COALESCE(fp.hostel_fee,0)+COALESCE(fp.mess_fee,0)-COALESCE(fp.discount,0)
          -COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id),0),
          0
        )::numeric AS balance_due
      FROM hostel_records hr
      JOIN students s ON s.id=hr.student_id
      LEFT JOIN courses c ON c.id=s.course_id
      LEFT JOIN batches b ON b.id=s.batch_id
      LEFT JOIN LATERAL (
        SELECT hfp.* FROM hostel_fee_periods hfp
        WHERE hfp.hostel_record_id=hr.id AND CURRENT_DATE BETWEEN hfp.start_date AND hfp.end_date
        ORDER BY hfp.start_date DESC, hfp.id DESC LIMIT 1
      ) fp ON TRUE
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
        COALESCE(efr.paid_amount,0)::numeric AS amount_paid,
        GREATEST(COALESCE(efr.exam_fee,0)-COALESCE(efr.discount,0)-COALESCE(efr.paid_amount,0),0)::numeric AS balance_due
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

router.get('/uniform', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        s.id AS student_id,
        s.student_id AS student_code,
        s.full_name,
        c.course_name,
        b.batch_name,
        COALESCE(su.status, CASE WHEN s.uniform_received THEN 'received' ELSE 'not_received' END) AS uniform_status,
        su.uniform_year,
        COALESCE(su.set_count, 0)::integer AS set_count,
        CASE su.uniform_year WHEN '1st Year' THEN 1400 WHEN '2nd Year' THEN 1000 ELSE 0 END::numeric AS price_per_set,
        (COALESCE(su.set_count, 0) * CASE su.uniform_year WHEN '1st Year' THEN 1400 WHEN '2nd Year' THEN 1000 ELSE 0 END)::numeric AS total_amount,
        COALESCE((SELECT SUM(p.amount) FROM payments p
          WHERE p.student_id=s.id AND p.payment_type='uniform' AND p.status='verified'),0)::numeric AS amount_paid,
        GREATEST((COALESCE(su.set_count, 0) * CASE su.uniform_year WHEN '1st Year' THEN 1400 WHEN '2nd Year' THEN 1000 ELSE 0 END) - COALESCE((SELECT SUM(p.amount) FROM payments p
          WHERE p.student_id=s.id AND p.payment_type='uniform' AND p.status='verified'),0),0)::numeric AS balance_due
      FROM students s
      LEFT JOIN student_uniform su ON su.student_id=s.id
      LEFT JOIN courses c ON c.id=s.course_id
      LEFT JOIN batches b ON b.id=s.batch_id
      WHERE s.status != 'discontinued'
        AND (su.status = 'received' OR s.uniform_received = true OR EXISTS (
          SELECT 1 FROM payments p WHERE p.student_id=s.id AND p.payment_type='uniform' AND p.status='verified'
        ))
      ORDER BY s.full_name ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /reports/uniform error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
