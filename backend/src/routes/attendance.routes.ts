import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// POST /api/attendance — upsert attendance for a date (no batch required)
router.post('/', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { attendance_date, records } = req.body;
    if (!attendance_date || !records || !Array.isArray(records)) {
      res.status(400).json({ success: false, message: 'attendance_date and records array required' });
      return;
    }
    const results = [];
    for (const rec of records) {
      const { student_id, status } = rec;
      const safeStatus = status === 'present' ? 'present' : 'absent';
      const r = await query(
        `INSERT INTO attendance (student_id, attendance_date, status, marked_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id, attendance_date) DO UPDATE
           SET status = EXCLUDED.status,
               marked_by = EXCLUDED.marked_by,
               updated_at = NOW()
         RETURNING *`,
        [student_id, attendance_date, safeStatus, req.user!.id]
      );
      results.push(r.rows[0]);
    }
    res.json({ success: true, data: results });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/attendance
router.get('/', authorize('super_admin', 'admin', 'incharge', 'teacher', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id: requestedStudentId, batch_id, start_date, end_date, attendance_date } = req.query;
    let student_id = requestedStudentId;
    if (req.user!.role === 'student') {
      const own = await query('SELECT id FROM students WHERE user_id=$1', [req.user!.id]);
      if (own.rows.length === 0) {
        res.status(403).json({ success: false, message: 'Student record not found' });
        return;
      }
      student_id = String(own.rows[0].id);
    }
    let q = `SELECT a.*, s.full_name as student_name, s.student_id as student_code,
             b.batch_name FROM attendance a
             LEFT JOIN students s ON s.id = a.student_id
             LEFT JOIN batches b ON b.id = a.batch_id
             WHERE 1=1`;
    const params: unknown[] = [];
    if (student_id)     { params.push(student_id);     q += ` AND a.student_id=$${params.length}`; }
    if (batch_id)       { params.push(batch_id);       q += ` AND a.batch_id=$${params.length}`; }
    if (attendance_date){ params.push(attendance_date); q += ` AND a.attendance_date=$${params.length}`; }
    if (start_date)     { params.push(start_date);     q += ` AND a.attendance_date>=$${params.length}`; }
    if (end_date)       { params.push(end_date);       q += ` AND a.attendance_date<=$${params.length}`; }
    q += ' ORDER BY a.attendance_date DESC, s.full_name ASC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/attendance/report/student/:studentId — individual report
router.get('/report/student/:studentId', authorize('super_admin', 'admin', 'incharge', 'teacher', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    const { start_date, end_date } = req.query;
    let targetStudentId = req.params.studentId;
    if (req.user!.role === 'student') {
      const own = await query('SELECT id FROM students WHERE user_id=$1', [req.user!.id]);
      if (own.rows.length === 0 || Number(own.rows[0].id) !== Number(targetStudentId)) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return;
      }
      targetStudentId = String(own.rows[0].id);
    }
    let q = `SELECT a.id, a.attendance_date, a.status, a.notes
             FROM attendance a
             WHERE a.student_id = $1`;
    const params: unknown[] = [targetStudentId];
    if (start_date) { params.push(start_date); q += ` AND a.attendance_date >= $${params.length}`; }
    if (end_date)   { params.push(end_date);   q += ` AND a.attendance_date <= $${params.length}`; }
    q += ' ORDER BY a.attendance_date ASC';
    const result = await query(q, params);

    // working_days = unique dates that appear in attendance for this student
    const workingDaysRes = await query(
      `SELECT COUNT(DISTINCT attendance_date) as working_days FROM attendance WHERE student_id = $1`,
      [targetStudentId]
    );
    const working_days = parseInt(workingDaysRes.rows[0]?.working_days) || 0;
    const present = result.rows.filter((r: any) => r.status === 'present').length;
    const absent  = result.rows.filter((r: any) => r.status === 'absent').length;
    const total   = result.rows.length;

    res.json({
      success: true,
      data: result.rows,
      summary: {
        total,
        working_days,
        present,
        absent,
        percentage: working_days > 0 ? Math.round((present / working_days) * 100) : 0,
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/attendance/report/all — overall summary for all active students
router.get('/report/all', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    // Compute working days = distinct dates that have any attendance record in the range
    let wdQ = `SELECT COUNT(DISTINCT attendance_date) as working_days FROM attendance WHERE 1=1`;
    const wdParams: unknown[] = [];
    if (start_date) { wdParams.push(start_date); wdQ += ` AND attendance_date >= $${wdParams.length}`; }
    if (end_date)   { wdParams.push(end_date);   wdQ += ` AND attendance_date <= $${wdParams.length}`; }
    const wdRes = await query(wdQ, wdParams);
    const working_days = parseInt(wdRes.rows[0]?.working_days) || 0;

    let q = `SELECT
               s.id, s.student_id as student_code, s.full_name,
               b.batch_name,
               COUNT(a.id) as total_days,
               SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present,
               SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) as absent
             FROM students s
             LEFT JOIN batches b ON b.id = s.batch_id
             LEFT JOIN attendance a ON a.student_id = s.id`;
    const conditions: string[] = [`s.status = 'active'`];
    const params: unknown[] = [];
    if (start_date) { params.push(start_date); conditions.push(`a.attendance_date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);   conditions.push(`a.attendance_date <= $${params.length}`); }
    if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
    q += ' GROUP BY s.id, s.student_id, s.full_name, b.batch_name ORDER BY s.full_name';
    const result = await query(q, params);
    const rows = result.rows.map((r: any) => ({
      ...r,
      total_days:   parseInt(r.total_days)  || 0,
      present:      parseInt(r.present)     || 0,
      absent:       parseInt(r.absent)      || 0,
      working_days,
      percentage:   working_days > 0
        ? Math.round((parseInt(r.present) / working_days) * 100)
        : 0,
    }));
    res.json({ success: true, data: rows, working_days });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// Kept for backward compatibility — not used by new UI but preserves other integrations
router.get('/report/monthly', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) { res.status(400).json({ success: false, message: 'month and year required' }); return; }
    const q = `SELECT s.id, s.student_id as student_code, s.full_name,
               COUNT(a.id) as total_days,
               SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present_days,
               SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) as absent_days
               FROM students s
               LEFT JOIN attendance a ON a.student_id = s.id
                 AND EXTRACT(MONTH FROM a.attendance_date)=$1
                 AND EXTRACT(YEAR FROM a.attendance_date)=$2
               WHERE s.status='active'
               GROUP BY s.id, s.student_id, s.full_name ORDER BY s.full_name`;
    const result = await query(q, [month, year]);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;
