import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/enrollments
router.get('/', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, course_id, status } = req.query;
    let q = `
      SELECT
        e.*,
        s.full_name  AS student_name,
        s.student_id AS student_code,
        c.course_name,
        cc.category_name,
        b.batch_name,
        COALESCE(e.application_fee, 0)                          AS application_fee,
        COALESCE(e.course_fee, 0)                               AS course_fee,
        COALESCE(e.materials_fee, 0)                            AS materials_fee,
        COALESCE(e.total_fee, 0)                                AS total_fee,
        COALESCE(
          (SELECT SUM(p.amount) FROM payments p
           WHERE p.enrollment_id = e.id AND p.status = 'verified'), 0
        )                                                       AS amount_paid,
        GREATEST(
          COALESCE(e.total_fee, 0) - COALESCE(
            (SELECT SUM(p.amount) FROM payments p
             WHERE p.enrollment_id = e.id AND p.status = 'verified'), 0
          ), 0
        )                                                       AS balance_amount
      FROM enrollments e
      LEFT JOIN students s    ON s.id  = e.student_id
      LEFT JOIN courses c     ON c.id  = e.course_id
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      LEFT JOIN batches b     ON b.id  = e.batch_id
      WHERE 1=1`;
    const params: unknown[] = [];
    if (student_id) { params.push(student_id); q += ` AND e.student_id=$${params.length}`; }
    if (course_id)  { params.push(course_id);  q += ` AND e.course_id=$${params.length}`;  }
    if (status)     { params.push(status);      q += ` AND e.status=$${params.length}`;     }
    q += ' ORDER BY e.created_at DESC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /enrollments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/enrollments
router.post('/', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      student_id, course_id, batch_id, notes, admission_date,
      application_fee, course_fee, materials_fee,
    } = req.body;
    if (!student_id || !course_id) {
      res.status(400).json({ success: false, message: 'student_id and course_id required' });
      return;
    }
    const existing = await query(
      'SELECT id FROM enrollments WHERE student_id=$1 AND course_id=$2',
      [student_id, course_id]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, message: 'Already enrolled in this course' });
      return;
    }
    const result = await query(
      `INSERT INTO enrollments
         (student_id, course_id, batch_id, notes, application_fee, course_fee, materials_fee)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        student_id,
        course_id,
        batch_id || null,
        notes || null,
        Number(application_fee) || 0,
        Number(course_fee)      || 0,
        Number(materials_fee)   || 0,
      ]
    );
    // Sync course/batch back to student row
    await query(
      `UPDATE students
       SET course_id = $1, batch_id = $2,
           admission_date = COALESCE($3::date, admission_date, CURRENT_DATE)
       WHERE id = $4`,
      [course_id, batch_id || null, admission_date || null, student_id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /enrollments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/enrollments/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT e.*,
        s.full_name AS student_name, s.student_id AS student_code,
        c.course_name, cc.category_name, b.batch_name,
        COALESCE(e.application_fee,0) AS application_fee,
        COALESCE(e.course_fee,0)      AS course_fee,
        COALESCE(e.materials_fee,0)   AS materials_fee,
        COALESCE(e.total_fee,0)       AS total_fee,
        COALESCE(
          (SELECT SUM(p.amount) FROM payments p WHERE p.enrollment_id = e.id AND p.status='verified'), 0
        ) AS amount_paid,
        GREATEST(
          COALESCE(e.total_fee,0) - COALESCE(
            (SELECT SUM(p.amount) FROM payments p WHERE p.enrollment_id = e.id AND p.status='verified'), 0
          ), 0
        ) AS balance_amount
       FROM enrollments e
       LEFT JOIN students s         ON s.id  = e.student_id
       LEFT JOIN courses c          ON c.id  = e.course_id
       LEFT JOIN course_categories cc ON cc.id = c.category_id
       LEFT JOIN batches b          ON b.id  = e.batch_id
       WHERE e.id=$1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /enrollments/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/enrollments/:id — update fee breakdown
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { batch_id, notes, application_fee, course_fee, materials_fee } = req.body;
    const result = await query(
      `UPDATE enrollments
       SET batch_id=$1, notes=$2,
           application_fee=$3, course_fee=$4, materials_fee=$5
       WHERE id=$6 RETURNING *`,
      [
        batch_id || null, notes || null,
        Number(application_fee) || 0,
        Number(course_fee)      || 0,
        Number(materials_fee)   || 0,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /enrollments/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/enrollments/:id/approve
router.patch('/:id/approve', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE enrollments SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2 RETURNING *`,
      [req.user!.id, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/enrollments/:id/reject
router.patch('/:id/reject', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { notes } = req.body;
    const result = await query(
      `UPDATE enrollments SET status='rejected', notes=$1 WHERE id=$2 RETURNING *`,
      [notes || null, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/enrollments/student/:studentId/progress
router.get('/student/:studentId/progress', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT e.*, c.course_name,
        COALESCE(e.total_fee, 0) AS total_fee,
        COALESCE(
          (SELECT SUM(p.amount) FROM payments p WHERE p.enrollment_id = e.id AND p.status='verified'), 0
        ) AS amount_paid,
        (SELECT COUNT(*) FROM lms_videos v WHERE v.course_id = e.course_id AND v.is_published = true) AS total_videos,
        (SELECT COUNT(*) FROM video_progress vp JOIN lms_videos v ON v.id = vp.video_id
         WHERE vp.student_id = e.student_id AND v.course_id = e.course_id AND vp.is_completed = true) AS completed_videos
       FROM enrollments e
       LEFT JOIN courses c ON c.id = e.course_id
       WHERE e.student_id=$1`,
      [req.params.studentId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
