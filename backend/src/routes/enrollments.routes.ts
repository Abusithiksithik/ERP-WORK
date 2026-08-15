import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, course_id, status } = req.query;
    let q = `SELECT e.*, s.full_name as student_name, s.student_id as student_code,
             c.course_name, cc.category_name, b.batch_name
             FROM enrollments e
             LEFT JOIN students s ON s.id = e.student_id
             LEFT JOIN courses c ON c.id = e.course_id
             LEFT JOIN course_categories cc ON cc.id = c.category_id
             LEFT JOIN batches b ON b.id = e.batch_id
             WHERE 1=1`;
    const params: unknown[] = [];
    if (student_id) { params.push(student_id); q += ` AND e.student_id=$${params.length}`; }
    if (course_id) { params.push(course_id); q += ` AND e.course_id=$${params.length}`; }
    if (status) { params.push(status); q += ` AND e.status=$${params.length}`; }
    q += ' ORDER BY e.created_at DESC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error('GET /enrollments error:', err); res.status(500).json({ success: false, message: 'Server error' }); }
});


router.post('/', authorize('super_admin', 'admin', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, course_id, batch_id, notes, admission_date } = req.body;
    if (!student_id || !course_id) { res.status(400).json({ success: false, message: 'student_id and course_id required' }); return; }
    const existing = await query('SELECT id FROM enrollments WHERE student_id=$1 AND course_id=$2', [student_id, course_id]);
    if (existing.rows.length > 0) { res.status(409).json({ success: false, message: 'Already enrolled in this course' }); return; }
    const result = await query(
      `INSERT INTO enrollments (student_id, course_id, batch_id, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [student_id, course_id, batch_id || null, notes || null]
    );
    // Sync academic fields back to the student row so student list/view reflects enrollment
    await query(
      `UPDATE students
       SET course_id = $1,
           batch_id  = $2,
           admission_date = COALESCE($3::date, admission_date, CURRENT_DATE)
       WHERE id = $4`,
      [course_id, batch_id || null, admission_date || null, student_id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT e.*, s.full_name as student_name, c.course_name, b.batch_name FROM enrollments e
       LEFT JOIN students s ON s.id = e.student_id
       LEFT JOIN courses c ON c.id = e.course_id
       LEFT JOIN batches b ON b.id = e.batch_id
       WHERE e.id=$1`, [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.patch('/:id/approve', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE enrollments SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2 RETURNING *`,
      [req.user!.id, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.patch('/:id/reject', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { notes } = req.body;
    const result = await query(
      `UPDATE enrollments SET status='rejected', notes=$1 WHERE id=$2 RETURNING *`,
      [notes || null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/student/:studentId/progress', async (req: AuthRequest, res: Response) => {
  try {
    const enrollments = await query(
      `SELECT e.*, c.course_name,
        (SELECT COUNT(*) FROM lms_videos v WHERE v.course_id = e.course_id AND v.is_published = true) as total_videos,
        (SELECT COUNT(*) FROM video_progress vp JOIN lms_videos v ON v.id = vp.video_id
         WHERE vp.student_id = e.student_id AND v.course_id = e.course_id AND vp.is_completed = true) as completed_videos
       FROM enrollments e LEFT JOIN courses c ON c.id = e.course_id
       WHERE e.student_id=$1`, [req.params.studentId]
    );
    res.json({ success: true, data: enrollments.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;
