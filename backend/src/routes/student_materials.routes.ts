import { Router, Response } from 'express';
import { query, pool } from '../config/db';
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
      res.json({ success: true, data: { student_id: req.params.student_id, status: 'pending', set_count: 0, notes: null } });
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
    const { status, notes, set_count } = req.body;
    const validStatuses = ['received', 'not_received', 'pending'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}` });
      return;
    }
    const setCount = status === 'received' ? Number(set_count) : 0;
    if (status === 'received' && ![1, 2].includes(setCount)) {
      res.status(400).json({ success: false, message: 'Select 1 or 2 uniform sets' });
      return;
    }

    // Update student_uniform table
    const result = await query(
      `INSERT INTO student_uniform (student_id, status, set_count, notes, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (student_id) DO UPDATE
         SET status = EXCLUDED.status,
             set_count = EXCLUDED.set_count,
             notes  = EXCLUDED.notes,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING *`,
      [req.params.student_id, status, setCount, notes || null, req.user!.id]
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

// ── POST /api/student-materials/uniform/:student_id/receive ────────────
// Mark uniform received with 1/2 sets and record the manual payment atomically.
router.post('/uniform/:student_id/receive', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { set_count, amount, payment_date, notes } = req.body;
    const setCount = Number(set_count);
    const payAmount = Number(amount);
    if (![1, 2].includes(setCount)) {
      res.status(400).json({ success: false, message: 'Select 1 or 2 uniform sets' });
      return;
    }
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      res.status(400).json({ success: false, message: 'Enter a valid payment amount' });
      return;
    }

    await client.query('BEGIN');
    const student = await client.query('SELECT id FROM students WHERE id=$1', [req.params.student_id]);
    if (student.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    const uniform = await client.query(
      `INSERT INTO student_uniform (student_id, status, set_count, notes, updated_by, updated_at)
       VALUES ($1, 'received', $2, $3, $4, NOW())
       ON CONFLICT (student_id) DO UPDATE
         SET status='received', set_count=EXCLUDED.set_count, notes=EXCLUDED.notes,
             updated_by=EXCLUDED.updated_by, updated_at=NOW()
       RETURNING *`,
      [req.params.student_id, setCount, notes || null, req.user!.id]
    );

    await client.query(
      `UPDATE students SET uniform_received=true WHERE id=$1`,
      [req.params.student_id]
    );

    const payment = await client.query(
      `INSERT INTO payments
         (student_id, enrollment_id, payment_method_id, amount, payment_date,
          transaction_reference, notes, payment_type, status, verified_by, verified_at)
       VALUES ($1, NULL, NULL, $2, $3, NULL, $4, 'uniform', 'verified', $5, NOW())
       RETURNING *`,
      [
        req.params.student_id,
        payAmount,
        payment_date || new Date().toISOString().split('T')[0],
        notes || 'Uniform payment',
        req.user!.id,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { uniform: uniform.rows[0], payment: payment.rows[0] } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /student-materials/uniform/:student_id/receive error:', err);
    res.status(500).json({ success: false, message: 'Failed to save uniform and payment' });
  } finally {
    client.release();
  }
});

export default router;
