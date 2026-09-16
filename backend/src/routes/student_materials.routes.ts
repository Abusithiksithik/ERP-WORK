import { Router, Response } from 'express';
import { query, pool } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const UNIFORM_FEE = 3000;


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
      `SELECT su.*, u.full_name AS updated_by_name,
              $2::numeric AS uniform_fee,
              (SELECT p.id FROM payments p
               WHERE p.student_id = su.student_id
                 AND p.payment_type = 'uniform'
                 AND p.status = 'verified'
               ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS payment_id,
              (SELECT p.amount FROM payments p
               WHERE p.student_id = su.student_id
                 AND p.payment_type = 'uniform'
                 AND p.status = 'verified'
               ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS payment_amount
       FROM student_uniform su
       LEFT JOIN users u ON u.id = su.updated_by
       WHERE su.student_id = $1`,
      [req.params.student_id, UNIFORM_FEE]
    );
    if (result.rows.length === 0) {
      // Return default pending status if not set
      const payment = await query(
        `SELECT p.id AS payment_id, p.amount AS payment_amount
         FROM payments p
         WHERE p.student_id=$1 AND p.payment_type='uniform' AND p.status='verified'
         ORDER BY p.created_at DESC, p.id DESC LIMIT 1`,
        [req.params.student_id]
      );
      res.json({ success: true, data: {
        student_id: req.params.student_id, status: payment.rows.length ? 'received' : 'pending',
        set_count: 0, notes: null, uniform_fee: UNIFORM_FEE,
        payment_id: payment.rows[0]?.payment_id || null,
        payment_amount: payment.rows[0]?.payment_amount || 0,
      } });
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

// ── PUT /api/student-materials/uniform/:student_id/payment ─────────────
// Update the single current uniform payment amount (maximum ₹3,000).
router.put('/uniform/:student_id/payment', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > UNIFORM_FEE) {
      res.status(400).json({ success: false, message: `Uniform payment must be between ₹1 and ₹${UNIFORM_FEE}` });
      return;
    }

    const student = await query('SELECT id FROM students WHERE id=$1', [req.params.student_id]);
    if (student.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    const existing = await query(
      `SELECT id FROM payments
       WHERE student_id=$1 AND payment_type='uniform' AND status='verified'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [req.params.student_id]
    );

    let payment;
    if (existing.rows.length > 0) {
      payment = await query(
        `UPDATE payments
         SET amount=$1, updated_at=NOW()
         WHERE id=$2 RETURNING *`,
        [amount, existing.rows[0].id]
      );
    } else {
      payment = await query(
        `INSERT INTO payments
           (student_id, enrollment_id, payment_method_id, amount, payment_date,
            transaction_reference, notes, payment_type, status, verified_by, verified_at)
         VALUES ($1, NULL, NULL, $2, CURRENT_DATE, NULL, 'Uniform payment', 'uniform', 'verified', $3, NOW())
         RETURNING *`,
        [req.params.student_id, amount, req.user!.id]
      );
    }

    res.json({ success: true, data: payment.rows[0] });
  } catch (err) {
    console.error('PUT /student-materials/uniform payment error:', err);
    res.status(500).json({ success: false, message: 'Failed to update uniform payment' });
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
    if (!Number.isFinite(payAmount) || payAmount <= 0 || payAmount > UNIFORM_FEE) {
      res.status(400).json({ success: false, message: `Uniform payment must be between ₹1 and ₹${UNIFORM_FEE}` });
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

    const existingPayment = await client.query(
      `SELECT id FROM payments
       WHERE student_id=$1 AND payment_type='uniform' AND status='verified'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [req.params.student_id]
    );

    let payment;
    if (existingPayment.rows.length > 0) {
      payment = await client.query(
        `UPDATE payments
         SET amount=$1, payment_date=$2, notes=$3, updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [
          payAmount,
          payment_date || new Date().toISOString().split('T')[0],
          notes || 'Uniform payment',
          existingPayment.rows[0].id,
        ]
      );
    } else {
      payment = await client.query(
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
    }

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
