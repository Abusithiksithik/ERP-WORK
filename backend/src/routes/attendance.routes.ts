import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// POST /api/attendance - Mark attendance for multiple students
router.post('/', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { batch_id, attendance_date, records } = req.body;
    if (!attendance_date || !records || !Array.isArray(records)) {
      res.status(400).json({ success: false, message: 'attendance_date and records array required' });
      return;
    }
    const results = [];
    for (const rec of records) {
      const { student_id, status, notes } = rec;
      const r = await query(
        `INSERT INTO attendance (student_id, batch_id, attendance_date, status, marked_by, notes)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (student_id, attendance_date) DO UPDATE
         SET status=$4, marked_by=$5, notes=$6
         RETURNING *`,
        [student_id, batch_id || null, attendance_date, status || 'present', req.user!.id, notes || null]
      );
      results.push(r.rows[0]);
    }
    res.json({ success: true, data: results });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/attendance
router.get('/', authorize('super_admin', 'admin', 'incharge', 'teacher', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, batch_id, start_date, end_date, attendance_date } = req.query;
    let q = `SELECT a.*, s.full_name as student_name, s.student_id as student_code,
             b.batch_name FROM attendance a
             LEFT JOIN students s ON s.id = a.student_id
             LEFT JOIN batches b ON b.id = a.batch_id
             WHERE 1=1`;
    const params: unknown[] = [];
    if (student_id) { params.push(student_id); q += ` AND a.student_id=$${params.length}`; }
    if (batch_id) { params.push(batch_id); q += ` AND a.batch_id=$${params.length}`; }
    if (attendance_date) { params.push(attendance_date); q += ` AND a.attendance_date=$${params.length}`; }
    if (start_date) { params.push(start_date); q += ` AND a.attendance_date>=$${params.length}`; }
    if (end_date) { params.push(end_date); q += ` AND a.attendance_date<=$${params.length}`; }
    q += ' ORDER BY a.attendance_date DESC, s.full_name ASC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/attendance/report/student/:studentId
router.get('/report/student/:studentId', authorize('super_admin', 'admin', 'incharge', 'teacher', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    let q = `SELECT a.*, s.full_name as student_name FROM attendance a
             LEFT JOIN students s ON s.id = a.student_id
             WHERE a.student_id=$1`;
    const params: unknown[] = [req.params.studentId];
    if (month && year) {
      params.push(month); q += ` AND EXTRACT(MONTH FROM a.attendance_date)=$${params.length}`;
      params.push(year); q += ` AND EXTRACT(YEAR FROM a.attendance_date)=$${params.length}`;
    }
    q += ' ORDER BY a.attendance_date ASC';
    const result = await query(q, params);
    const total = result.rows.length;
    const present = result.rows.filter((r: { status: string }) => r.status === 'present').length;
    const absent = result.rows.filter((r: { status: string }) => r.status === 'absent').length;
    const late = result.rows.filter((r: { status: string }) => r.status === 'late').length;
    res.json({ success: true, data: result.rows, summary: { total, present, absent, late, percentage: total > 0 ? Math.round((present / total) * 100) : 0 } });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/attendance/report/monthly
router.get('/report/monthly', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { batch_id, month, year } = req.query;
    if (!month || !year) { res.status(400).json({ success: false, message: 'month and year required' }); return; }
    let q = `SELECT s.id, s.student_id as student_code, s.full_name,
             COUNT(a.id) as total_days,
             SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present_days,
             SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) as absent_days,
             SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) as late_days
             FROM students s
             LEFT JOIN attendance a ON a.student_id = s.id
               AND EXTRACT(MONTH FROM a.attendance_date)=$1
               AND EXTRACT(YEAR FROM a.attendance_date)=$2`;
    const params: unknown[] = [month, year];
    if (batch_id) { params.push(batch_id); q += ` AND a.batch_id=$${params.length} AND s.batch_id=$${params.length}`; }
    q += ' WHERE s.status=\'active\' GROUP BY s.id, s.student_id, s.full_name ORDER BY s.full_name';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/attendance/report/all — aggregate totals for all students, optional date range
router.get('/report/all', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { start_date, end_date, batch_id } = req.query;
    let q = `SELECT
               s.id, s.student_id as student_code, s.full_name,
               b.batch_name,
               COUNT(a.id) as total_days,
               SUM(CASE WHEN a.status='present'  THEN 1 ELSE 0 END) as present,
               SUM(CASE WHEN a.status='absent'   THEN 1 ELSE 0 END) as absent,
               SUM(CASE WHEN a.status='late'     THEN 1 ELSE 0 END) as late,
               SUM(CASE WHEN a.status='excused'  THEN 1 ELSE 0 END) as excused
             FROM students s
             LEFT JOIN batches b ON b.id = s.batch_id
             LEFT JOIN attendance a ON a.student_id = s.id`;
    const conditions: string[] = [`s.status != 'discontinued'`];
    const params: unknown[] = [];
    if (start_date) { params.push(start_date); conditions.push(`a.attendance_date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);   conditions.push(`a.attendance_date <= $${params.length}`); }
    if (batch_id)   { params.push(batch_id);   conditions.push(`s.batch_id = $${params.length}`); }
    if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
    q += ' GROUP BY s.id, s.student_id, s.full_name, b.batch_name ORDER BY s.full_name';
    const result = await query(q, params);
    const rows = result.rows.map((r: any) => ({
      ...r,
      total_days: parseInt(r.total_days) || 0,
      present:    parseInt(r.present)    || 0,
      absent:     parseInt(r.absent)     || 0,
      late:       parseInt(r.late)       || 0,
      excused:    parseInt(r.excused)    || 0,
      percentage: parseInt(r.total_days) > 0
        ? Math.round(((parseInt(r.present) + parseInt(r.late)) / parseInt(r.total_days)) * 100)
        : 0,
    }));
    res.json({ success: true, data: rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/attendance/report/batch/:batchId — per-batch daily summary
router.get('/report/batch/:batchId', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const { batchId } = req.params;

    // Student totals for the batch on the given date
    const summaryRes = await query(
      `SELECT
         COUNT(s.id) as total_students,
         SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present_today,
         SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) as absent_today,
         SUM(CASE WHEN a.status='late'    THEN 1 ELSE 0 END) as late_today,
         SUM(CASE WHEN a.status='excused' THEN 1 ELSE 0 END) as excused_today
       FROM students s
       LEFT JOIN attendance a ON a.student_id = s.id AND a.attendance_date = $2
       WHERE s.batch_id = $1 AND s.status != 'discontinued'`,
      [batchId, targetDate]
    );

    // Per-student breakdown
    const studentsRes = await query(
      `SELECT
         s.id, s.student_id as student_code, s.full_name,
         COALESCE(a.status, 'not_marked') as today_status,
         COUNT(all_a.id)                                                    as total_days,
         SUM(CASE WHEN all_a.status='present'  THEN 1 ELSE 0 END)          as present,
         SUM(CASE WHEN all_a.status='absent'   THEN 1 ELSE 0 END)          as absent,
         SUM(CASE WHEN all_a.status='late'     THEN 1 ELSE 0 END)          as late,
         SUM(CASE WHEN all_a.status='excused'  THEN 1 ELSE 0 END)          as excused
       FROM students s
       LEFT JOIN attendance a     ON a.student_id = s.id AND a.attendance_date = $2
       LEFT JOIN attendance all_a ON all_a.student_id = s.id AND all_a.batch_id = $1
       WHERE s.batch_id = $1 AND s.status != 'discontinued'
       GROUP BY s.id, s.student_id, s.full_name, a.status
       ORDER BY s.full_name`,
      [batchId, targetDate]
    );

    const summary = summaryRes.rows[0];
    const total = parseInt(summary.total_students) || 0;
    const present = parseInt(summary.present_today) || 0;
    const data = studentsRes.rows.map((r: any) => ({
      ...r,
      total_days: parseInt(r.total_days) || 0,
      present:    parseInt(r.present)    || 0,
      absent:     parseInt(r.absent)     || 0,
      late:       parseInt(r.late)       || 0,
      excused:    parseInt(r.excused)    || 0,
      percentage: parseInt(r.total_days) > 0
        ? Math.round(((parseInt(r.present) + parseInt(r.late)) / parseInt(r.total_days)) * 100)
        : 0,
    }));
    res.json({
      success: true,
      summary: {
        total_students:  total,
        present_today:   present,
        absent_today:    parseInt(summary.absent_today)  || 0,
        late_today:      parseInt(summary.late_today)    || 0,
        excused_today:   parseInt(summary.excused_today) || 0,
        percentage: total > 0 ? Math.round((present / total) * 100) : 0,
        date: targetDate,
      },
      data,
    });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;

