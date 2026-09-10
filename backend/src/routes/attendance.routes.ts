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
        `INSERT INTO attendance (student_id, batch_id, attendance_date, status, marked_by)
         SELECT $1, s.batch_id, $2, $3, $4
         FROM students s
         WHERE s.id=$1
         ON CONFLICT (student_id, attendance_date) DO UPDATE
           SET batch_id = EXCLUDED.batch_id,
               status = EXCLUDED.status,
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

// GET /api/attendance/report/hierarchy — main course -> sub course -> batch
router.get('/report/hierarchy', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(cc.id, 0) AS category_id,
        COALESCE(cc.category_name, 'No Category') AS category_name,
        c.id AS course_id,
        c.course_name,
        b.id AS batch_id,
        b.batch_name,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') AS active_students
      FROM courses c
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      LEFT JOIN batches b ON b.course_id = c.id
      LEFT JOIN students s ON s.batch_id = b.id
      WHERE c.status = 'active'
      GROUP BY cc.id, cc.category_name, c.id, c.course_name, b.id, b.batch_name
      ORDER BY category_name ASC, c.course_name ASC, b.batch_name ASC
    `);

    const groups: any[] = [];
    const byCategory = new Map<number, any>();
    const byCourse = new Map<number, any>();

    for (const row of result.rows) {
      const categoryId = Number(row.category_id);
      let category = byCategory.get(categoryId);
      if (!category) {
        category = { id: categoryId, name: row.category_name, courses: [] };
        byCategory.set(categoryId, category);
        groups.push(category);
      }

      const courseId = Number(row.course_id);
      let course = byCourse.get(courseId);
      if (!course) {
        course = { id: courseId, name: row.course_name, batches: [] };
        byCourse.set(courseId, course);
        category.courses.push(course);
      }

      if (row.batch_id !== null) {
        course.batches.push({
          id: Number(row.batch_id),
          name: row.batch_name,
          active_students: Number(row.active_students || 0),
        });
      }
    }

    res.json({ success: true, data: groups });
  } catch (err) {
    console.error('GET /attendance/report/hierarchy error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/attendance/report/batch/:batchId — date-wise attendance for a selected batch
router.get('/report/batch/:batchId', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { start_date, end_date } = req.query;
    const batchId = req.params.batchId;
    const params: unknown[] = [batchId];

    let q = `
      SELECT
        a.id,
        a.attendance_date,
        a.status,
        s.id AS student_id,
        s.student_id AS student_code,
        s.full_name,
        b.batch_name,
        c.course_name,
        cc.category_name
      FROM attendance a
      JOIN students s ON s.id = a.student_id
      LEFT JOIN batches b ON b.id = COALESCE(a.batch_id, s.batch_id)
      LEFT JOIN courses c ON c.id = b.course_id
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      WHERE COALESCE(a.batch_id, s.batch_id) = $1`;

    if (start_date) { params.push(start_date); q += ` AND a.attendance_date >= $${params.length}`; }
    if (end_date)   { params.push(end_date);   q += ` AND a.attendance_date <= $${params.length}`; }
    q += ' ORDER BY a.attendance_date ASC, s.full_name ASC';

    const result = await query(q, params);
    const rows = result.rows;
    const present = rows.filter((r: any) => r.status === 'present').length;
    const absent = rows.filter((r: any) => r.status === 'absent').length;
    const dates = [...new Set(rows.map((r: any) => String(r.attendance_date).slice(0, 10)))];

    res.json({
      success: true,
      data: rows,
      summary: {
        working_days: dates.length,
        present,
        absent,
        total_records: rows.length,
      },
      batch: rows[0] ? {
        batch_id: Number(batchId),
        batch_name: rows[0].batch_name,
        course_name: rows[0].course_name,
        category_name: rows[0].category_name,
      } : null,
    });
  } catch (err) {
    console.error('GET /attendance/report/batch/:batchId error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
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
