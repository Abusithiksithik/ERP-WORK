import { Router, Response } from 'express';
import { query } from '../config/db';
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

// POST /api/payments — manual admin entry, auto-verified
router.post('/', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      student_id, enrollment_id, payment_method_id,
      amount, payment_date, transaction_reference, notes,
    } = req.body;
    if (!student_id || !amount || Number(amount) <= 0) {
      res.status(400).json({ success: false, message: 'student_id and a positive amount are required' });
      return;
    }
    if (enrollment_id) {
      const enrollmentCheck = await query(
        'SELECT student_id, status FROM enrollments WHERE id=$1',
        [enrollment_id]
      );
      if (enrollmentCheck.rows.length === 0) {
        res.status(400).json({ success: false, message: 'Enrollment not found' });
        return;
      }
      if (Number(enrollmentCheck.rows[0].student_id) !== Number(student_id)) {
        res.status(400).json({ success: false, message: 'Payment student does not match enrollment student' });
        return;
      }
      if (enrollmentCheck.rows[0].status !== 'approved') {
        res.status(400).json({ success: false, message: 'Payments can only be recorded for approved enrollments' });
        return;
      }
    }

    // Auto-verify since this is a manual admin entry
    const result = await query(
      `INSERT INTO payments
         (student_id, enrollment_id, payment_method_id, amount, payment_date,
          transaction_reference, notes, status, verified_by, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'verified',$8,NOW()) RETURNING *`,
      [
        student_id,
        enrollment_id   || null,
        payment_method_id || null,
        Number(amount),
        payment_date || new Date().toISOString().split('T')[0],
        transaction_reference || null,
        notes || null,
        req.user!.id,
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /payments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
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
      amount, payment_date, transaction_reference, notes, status,
    } = req.body;
    if (!student_id || !amount) {
      res.status(400).json({ success: false, message: 'student_id and amount required' });
      return;
    }
    const result = await query(
      `UPDATE payments
       SET student_id=$1, enrollment_id=$2, payment_method_id=$3, amount=$4,
           payment_date=$5, transaction_reference=$6, notes=$7, status=$8
       WHERE id=$9 RETURNING *`,
      [
        student_id,
        enrollment_id   || null,
        payment_method_id || null,
        Number(amount),
        payment_date || new Date().toISOString().split('T')[0],
        transaction_reference || null,
        notes || null,
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
