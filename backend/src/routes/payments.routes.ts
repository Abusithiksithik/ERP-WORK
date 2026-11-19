import { Router, Response } from 'express';
import { pool, query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/payments
router.get('/', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, status, start_date, end_date } = req.query;
    let q = `
      SELECT
        p.*,
        s.full_name      AS student_name,
        s.student_id     AS student_code,
        u.full_name      AS recorded_by_name,
        pm.method_type,
        c.course_name,
        cc.category_name,
        e.total_fee,
        COALESCE(e.discount, 0) AS enrollment_discount,
        COALESCE(
          (SELECT SUM(p2.amount) FROM payments p2
           WHERE p2.enrollment_id = p.enrollment_id AND p2.status = 'verified'), 0
        ) AS total_paid_for_enrollment,
        GREATEST(
          COALESCE(e.total_fee, 0) - COALESCE(e.discount, 0) -
          COALESCE(
            (SELECT SUM(p2.amount) FROM payments p2
             WHERE p2.enrollment_id = p.enrollment_id AND p2.status = 'verified'), 0
          ), 0
        ) AS balance_amount
      FROM payments p
      LEFT JOIN students s         ON s.id  = p.student_id
      LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
      LEFT JOIN users u            ON u.id = p.verified_by
      LEFT JOIN enrollments e      ON e.id  = p.enrollment_id
      LEFT JOIN courses c          ON c.id  = e.course_id
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      WHERE 1=1`;
    const params: unknown[] = [];
    if (student_id)  { params.push(student_id);  q += ` AND p.student_id=$${params.length}`;    }
    if (status)      { params.push(status);       q += ` AND p.status=$${params.length}`;        }
    if (start_date)  { params.push(start_date);   q += ` AND p.payment_date>=$${params.length}`; }
    if (end_date)    { params.push(end_date);     q += ` AND p.payment_date<=$${params.length}`; }
    q += ' ORDER BY p.created_at DESC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /payments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/payments — manual admin entry, auto-verified.
// Enrollment row locking prevents concurrent partial payments from exceeding the due balance.
router.post('/', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const {
      student_id, enrollment_id, payment_method_id,
      amount, payment_date, transaction_reference, notes, payment_type, fee_type,
    } = req.body;
    const amt = Number(amount);
    if (!student_id || !Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ success: false, message: 'student_id and a positive amount are required' });
      return;
    }

    await client.query('BEGIN');
    inTransaction = true;

    if (payment_method_id) {
      const method = await client.query('SELECT id FROM payment_methods WHERE id=$1 AND is_enabled=TRUE', [payment_method_id]);
      if (!method.rows.length) {
        await client.query('ROLLBACK'); inTransaction = false;
        res.status(400).json({ success: false, message: 'Selected payment method is not enabled' });
        return;
      }
    }

    if (enrollment_id) {
      const enrollmentCheck = await client.query(
        'SELECT id, student_id, status, total_fee, discount FROM enrollments WHERE id=$1 FOR UPDATE',
        [enrollment_id]
      );
      if (!enrollmentCheck.rows.length) {
        await client.query('ROLLBACK'); inTransaction = false;
        res.status(400).json({ success: false, message: 'Enrollment not found' });
        return;
      }
      const enrollment = enrollmentCheck.rows[0];
      if (Number(enrollment.student_id) !== Number(student_id)) {
        await client.query('ROLLBACK'); inTransaction = false;
        res.status(400).json({ success: false, message: 'Payment student does not match enrollment student' });
        return;
      }
      if (enrollment.status !== 'approved') {
        await client.query('ROLLBACK'); inTransaction = false;
        res.status(400).json({ success: false, message: 'Payments can only be recorded for approved enrollments' });
        return;
      }
      const paid = await client.query(
        `SELECT COALESCE(SUM(amount),0)::numeric AS paid FROM payments
         WHERE enrollment_id=$1 AND status='verified'`, [enrollment_id]
      );
      const due = Math.max(0, Number(enrollment.total_fee || 0) - Number(enrollment.discount || 0) - Number(paid.rows[0].paid || 0));
      if (amt > due + 0.000001) {
        await client.query('ROLLBACK'); inTransaction = false;
        res.status(400).json({ success: false, message: `Payment exceeds the outstanding balance of ₹${due.toLocaleString('en-IN')}` });
        return;
      }
    }

    const result = await client.query(
      `INSERT INTO payments
         (student_id, enrollment_id, payment_method_id, amount, payment_date,
          transaction_reference, notes, payment_type, status, verified_by, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'verified',$9,NOW()) RETURNING *`,
      [student_id, enrollment_id || null, payment_method_id || null, amt,
       payment_date || new Date().toISOString().split('T')[0], transaction_reference || null,
       notes || null, payment_type || fee_type || 'course_fee', req.user!.id]
    );
    await client.query('COMMIT'); inTransaction = false;
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (inTransaction) await client.query('ROLLBACK');
    console.error('POST /payments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/payments/:id
router.get('/:id', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT p.*, s.full_name AS student_name, s.student_id AS student_code, pm.method_type
       FROM payments p
       LEFT JOIN students s ON s.id = p.student_id
       LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
       WHERE p.id=$1`,
      [req.params.id]
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

// PUT /api/payments/:id
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      student_id, enrollment_id, payment_method_id,
      amount, payment_date, transaction_reference, notes, status, payment_type, fee_type,
    } = req.body;
    if (!student_id || !amount) {
      res.status(400).json({ success: false, message: 'student_id and amount required' });
      return;
    }
    const result = await query(
      `UPDATE payments
       SET student_id=$1, enrollment_id=$2, payment_method_id=$3, amount=$4,
           payment_date=$5, transaction_reference=$6, notes=$7, payment_type=$8, status=$9
       WHERE id=$10 RETURNING *`,
      [
        student_id,
        enrollment_id   || null,
        payment_method_id || null,
        Number(amount),
        payment_date || new Date().toISOString().split('T')[0],
        transaction_reference || null,
        notes || null,
        payment_type || fee_type || 'course_fee',
        status || 'verified',
        req.params.id,
      ]
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

// DELETE /api/payments/:id
router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM payments WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Payment deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
