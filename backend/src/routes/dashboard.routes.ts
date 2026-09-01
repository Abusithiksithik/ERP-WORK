import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, authorize('super_admin', 'admin', 'incharge', 'teacher'));

// GET /api/dashboard/stats
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [candidates, courses, faculty, activeCandidates, pendingPayments, activeEnrollments] = await Promise.all([
      query("SELECT COUNT(*) FROM students WHERE status='active'"),
      query("SELECT COUNT(*) FROM courses WHERE status='active'"),
      query("SELECT COUNT(*) FROM users WHERE role IN ('incharge','teacher')"),
      query("SELECT COUNT(*) FROM students WHERE status='active'"),
      query("SELECT COUNT(*) FROM payments WHERE status='pending'"),
      query("SELECT COUNT(*) FROM enrollments WHERE status='approved'"),
    ]);
    res.json({
      success: true,
      data: {
        totalCandidates:   parseInt(candidates.rows[0].count),
        totalCourses:      parseInt(courses.rows[0].count),
        totalFaculty:      parseInt(faculty.rows[0].count),
        activeCandidates:  parseInt(activeCandidates.rows[0].count),
        pendingPayments:   parseInt(pendingPayments.rows[0].count),
        activeEnrollments: parseInt(activeEnrollments.rows[0].count),
      }
    });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/recent-students
router.get('/recent-students', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT s.student_id, s.full_name, c.course_name, s.status, s.admission_date
      FROM students s
      LEFT JOIN courses c ON c.id = s.course_id
      WHERE s.status = 'active'
      ORDER BY s.created_at DESC
      LIMIT 5
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/charts/revenue — last 12 months verified payments
router.get('/charts/revenue', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT TO_CHAR(payment_date, 'Mon YYYY') as month,
             DATE_TRUNC('month', payment_date) as month_date,
             COALESCE(SUM(amount),0) as revenue
      FROM payments WHERE status='verified'
        AND payment_date >= NOW() - INTERVAL '12 months'
      GROUP BY month, month_date ORDER BY month_date ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/charts/enrollments
router.get('/charts/enrollments', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT TO_CHAR(enrolled_at, 'Mon YYYY') as month,
             DATE_TRUNC('month', enrolled_at) as month_date,
             COUNT(*) as enrollments
      FROM enrollments
      WHERE enrolled_at >= NOW() - INTERVAL '12 months'
        AND status = 'approved'
      GROUP BY month, month_date ORDER BY month_date ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/charts/students
router.get('/charts/students', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT TO_CHAR(created_at, 'Mon YYYY') as month,
             DATE_TRUNC('month', created_at) as month_date,
             COUNT(*) as students
      FROM students
      WHERE created_at >= NOW() - INTERVAL '12 months'
        AND status = 'active'
      GROUP BY month, month_date ORDER BY month_date ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/charts/course-finance — course-wise paid + pending (exam fees)
router.get('/charts/course-finance', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(cc.category_name, 'No Category') AS category_name,
        c.course_name,
        COALESCE(cc.category_name, '') || ' → ' || c.course_name AS label,
        COUNT(DISTINCT efr.student_id)                              AS candidate_count,
        COALESCE(SUM(efr.exam_fee + efr.other_fee), 0)::numeric    AS total_fee,
        COALESCE(SUM(efr.paid_amount), 0)::numeric                  AS paid_amount,
        GREATEST(
          COALESCE(SUM(efr.exam_fee + efr.other_fee), 0)
          - COALESCE(SUM(efr.paid_amount), 0),
          0
        )::numeric                                                   AS pending_amount
      FROM exam_fee_records efr
      JOIN students s ON s.id = efr.student_id AND s.status = 'active'
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
      LEFT JOIN courses c ON c.id = s.course_id
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      GROUP BY cc.category_name, c.course_name
      HAVING COUNT(DISTINCT efr.student_id) > 0
      ORDER BY cc.category_name, c.course_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /dashboard/charts/course-finance error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/dashboard/charts/exam-fee-summary — overall exam fee summary
router.get('/charts/exam-fee-summary', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(SUM(efr.exam_fee + efr.other_fee), 0)::numeric AS total_fee,
        COALESCE(SUM(efr.paid_amount), 0)::numeric               AS paid_amount,
        GREATEST(
          COALESCE(SUM(efr.exam_fee + efr.other_fee), 0)
          - COALESCE(SUM(efr.paid_amount), 0),
          0
        )::numeric                                                AS pending_amount
      FROM exam_fee_records efr
      JOIN students s ON s.id = efr.student_id AND s.status = 'active'
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /dashboard/charts/exam-fee-summary error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
