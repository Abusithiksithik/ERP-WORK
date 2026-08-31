import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ── GET /api/student-materials?student_id=X ────────────────────────────
router.get('/', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id } = req.query;
    if (!student_id) {
      res.status(400).json({ success: false, message: 'student_id is required' });
      return;
    }
    const result = await query(
      `SELECT sm.*, u.full_name AS given_by_name
       FROM student_materials sm
       LEFT JOIN users u ON u.id = sm.given_by
       WHERE sm.student_id = $1
       ORDER BY sm.date_given DESC, sm.created_at DESC`,
      [student_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /student-materials error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/student-materials ────────────────────────────────────────
router.post('/', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, title, description, material_type, date_given } = req.body;
    if (!student_id || !title) {
      res.status(400).json({ success: false, message: 'student_id and title are required' });
      return;
    }
    const result = await query(
      `INSERT INTO student_materials (student_id, title, description, material_type, date_given, given_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        student_id,
        String(title).trim(),
        description || null,
        material_type || 'book',
        date_given || new Date().toISOString().split('T')[0],
        req.user!.id,
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /student-materials error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── DELETE /api/student-materials/:id ─────────────────────────────────
router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM student_materials WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Material record deleted' });
  } catch (err) {
    console.error('DELETE /student-materials/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/student-materials/uniform/:student_id ─────────────────────
router.get('/uniform/:student_id', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT su.*, u.full_name AS updated_by_name
       FROM student_uniform su
       LEFT JOIN users u ON u.id = su.updated_by
       WHERE su.student_id = $1`,
      [req.params.student_id]
    );
    if (result.rows.length === 0) {
      // Return default pending status if not set
      res.json({ success: true, data: { student_id: req.params.student_id, status: 'pending', notes: null } });
    } else {
      res.json({ success: true, data: result.rows[0] });
    }
  } catch (err) {
    console.error('GET /student-materials/uniform error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── PUT /api/student-materials/uniform/:student_id ─────────────────────
router.put('/uniform/:student_id', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['received', 'not_received', 'pending'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}` });
      return;
    }
    // Update student_uniform table
    const result = await query(
      `INSERT INTO student_uniform (student_id, status, notes, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (student_id) DO UPDATE
         SET status = EXCLUDED.status,
             notes  = EXCLUDED.notes,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING *`,
      [req.params.student_id, status, notes || null, req.user!.id]
    );
    // Sync to students.uniform_received (single source of truth)
    await query(
      `UPDATE students SET uniform_received = $1 WHERE id = $2`,
      [status === 'received', req.params.student_id]
    ).catch(() => { /* non-critical */ });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /student-materials/uniform error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
