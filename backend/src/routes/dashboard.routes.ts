import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, authorize('super_admin', 'admin', 'incharge', 'teacher'));

// GET /api/dashboard/stats
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [students, courses, faculty, activeStudents, pendingPayments] = await Promise.all([
      query('SELECT COUNT(*) FROM students'),
      query("SELECT COUNT(*) FROM courses WHERE status='active'"),
      query("SELECT COUNT(*) FROM users WHERE role IN ('incharge','teacher')"),
      query("SELECT COUNT(*) FROM students WHERE status='active'"),
      query("SELECT COUNT(*) FROM payments WHERE status='pending'"),
    ]);
    res.json({
      success: true,
      data: {
        totalStudents: parseInt(students.rows[0].count),
        totalCourses: parseInt(courses.rows[0].count),
        totalFaculty: parseInt(faculty.rows[0].count),
        activeStudents: parseInt(activeStudents.rows[0].count),
        pendingPayments: parseInt(pendingPayments.rows[0].count),
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
      WHERE s.status != 'discontinued'
      ORDER BY s.created_at DESC
      LIMIT 5
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/charts/revenue
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
      FROM enrollments WHERE enrolled_at >= NOW() - INTERVAL '12 months'
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
      FROM students WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month, month_date ORDER BY month_date ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;
