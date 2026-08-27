import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/courses
// Supports ?category_id=, ?status=, ?include_inactive=true
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, status } = req.query;
    let q = `
      SELECT c.*,
        cc.category_name,
        (SELECT COUNT(*) FROM students s WHERE s.course_id = c.id AND s.status != 'discontinued') AS student_count
      FROM courses c
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (category_id) { params.push(category_id); q += ` AND c.category_id=$${params.length}`; }
    if (status) { params.push(status); q += ` AND c.status=$${params.length}`; }
    q += ' ORDER BY cc.category_name ASC NULLS LAST, c.course_name ASC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /courses error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/courses
router.post('/', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { course_name, description, duration, fee_amount, is_free, status, category_id } = req.body;

    if (!course_name || !String(course_name).trim()) {
      res.status(400).json({ success: false, message: 'Course name is required' });
      return;
    }
    const name = String(course_name).trim();
    if (name.length > 200) {
      res.status(400).json({ success: false, message: 'Course name must be under 200 characters' });
      return;
    }
    const fee = parseFloat(fee_amount) || 0;
    if (fee < 0) {
      res.status(400).json({ success: false, message: 'Fee amount cannot be negative' });
      return;
    }
    const catId = category_id ? parseInt(String(category_id)) : null;

    // Check duplicate name within same category
    const dupCheck = catId
      ? await query('SELECT id FROM courses WHERE LOWER(course_name)=LOWER($1) AND category_id=$2', [name, catId])
      : await query('SELECT id FROM courses WHERE LOWER(course_name)=LOWER($1) AND category_id IS NULL', [name]);
    if (dupCheck.rows.length > 0) {
      res.status(409).json({ success: false, message: 'A course with this name already exists in this category' });
      return;
    }

    const result = await query(
      `INSERT INTO courses (category_id, course_name, description, duration, fee_amount, is_free, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [catId, name, description?.trim() || null, duration?.trim() || null,
       fee, is_free === true || is_free === 'true', status || 'active', req.user!.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /courses error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/courses/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT c.*, cc.category_name FROM courses c
       LEFT JOIN course_categories cc ON cc.id = c.category_id
       WHERE c.id=$1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /courses/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/courses/:id
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { course_name, description, duration, fee_amount, is_free, status, category_id } = req.body;

    if (!course_name || !String(course_name).trim()) {
      res.status(400).json({ success: false, message: 'Course name is required' });
      return;
    }
    const name = String(course_name).trim();
    const fee = parseFloat(fee_amount) || 0;
    if (fee < 0) {
      res.status(400).json({ success: false, message: 'Fee amount cannot be negative' });
      return;
    }
    const catId = category_id ? parseInt(String(category_id)) : null;

    // Check duplicate name within same category, excluding self
    const dupCheck = catId
      ? await query('SELECT id FROM courses WHERE LOWER(course_name)=LOWER($1) AND category_id=$2 AND id!=$3', [name, catId, req.params.id])
      : await query('SELECT id FROM courses WHERE LOWER(course_name)=LOWER($1) AND category_id IS NULL AND id!=$2', [name, req.params.id]);
    if (dupCheck.rows.length > 0) {
      res.status(409).json({ success: false, message: 'A course with this name already exists in this category' });
      return;
    }

    const result = await query(
      `UPDATE courses SET category_id=$1, course_name=$2, description=$3, duration=$4,
        fee_amount=$5, is_free=$6, status=$7
       WHERE id=$8 RETURNING *`,
      [catId, name, description?.trim() || null, duration?.trim() || null,
       fee, is_free === true || is_free === 'true', status || 'active', req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /courses/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/courses/:id — cascade: payments → enrollments → students.course_id → course
router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const cid = req.params.id;
    // 1. Delete payments linked to enrollments of this course
    await query(
      `DELETE FROM payments WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id=$1)`,
      [cid]
    );
    // 2. Delete enrollments for this course
    await query('DELETE FROM enrollments WHERE course_id=$1', [cid]);
    // 3. Nullify course_id on students (keep student records intact)
    await query('UPDATE students SET course_id=NULL WHERE course_id=$1', [cid]);
    // 4. Delete the course
    await query('DELETE FROM courses WHERE id=$1', [cid]);
    res.json({ success: true, message: 'Course deleted' });
  } catch (err) {
    console.error('DELETE /courses/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/courses/:id/status — toggle
router.patch('/:id/status', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT status FROM courses WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    const newStatus = result.rows[0].status === 'active' ? 'inactive' : 'active';
    const updated = await query('UPDATE courses SET status=$1 WHERE id=$2 RETURNING *', [newStatus, req.params.id]);
    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('PATCH /courses/:id/status error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// GET /api/courses/:id/check-access — check if current user has access to this course
router.get('/:id/check-access', async (req: AuthRequest, res: Response) => {
  try {
    const courseRes = await query('SELECT id, course_name, is_free FROM courses WHERE id=$1', [req.params.id]);
    if (courseRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    const course = courseRes.rows[0];

    // Free courses — always accessible
    if (course.is_free) {
      res.json({ success: true, hasAccess: true, reason: 'free' });
      return;
    }

    // Admin / incharge / teacher — always have access
    const adminRoles = ['super_admin', 'admin', 'incharge', 'teacher'];
    if (adminRoles.includes(req.user!.role)) {
      res.json({ success: true, hasAccess: true, reason: 'staff' });
      return;
    }

    // Student — must be enrolled AND have a verified payment
    const studentRes = await query('SELECT id FROM students WHERE user_id=$1', [req.user!.id]);
    if (studentRes.rows.length === 0) {
      res.json({ success: false, hasAccess: false, reason: 'not_a_student', message: 'Student record not found' });
      return;
    }
    const studentId = studentRes.rows[0].id;
    const enrollment = await query(
      `SELECT e.id FROM enrollments e
       INNER JOIN payments p ON p.enrollment_id = e.id
       WHERE e.student_id=$1 AND e.course_id=$2 AND e.status='approved' AND p.status='verified'
       LIMIT 1`,
      [studentId, req.params.id]
    );
    if (enrollment.rows.length > 0) {
      res.json({ success: true, hasAccess: true, reason: 'paid_enrolled' });
    } else {
      // Check if enrolled but not paid
      const enrollOnly = await query(
        'SELECT id FROM enrollments WHERE student_id=$1 AND course_id=$2 LIMIT 1',
        [studentId, req.params.id]
      );
      if (enrollOnly.rows.length > 0) {
        res.json({ success: false, hasAccess: false, reason: 'not_paid', message: 'Complete your fee payment to access this course' });
      } else {
        res.json({ success: false, hasAccess: false, reason: 'not_enrolled', message: 'You are not enrolled in this course' });
      }
    }
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;
