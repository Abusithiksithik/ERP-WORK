import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/payments
router.get('/', authorize('super_admin', 'admin', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, status, start_date, end_date } = req.query;
    let q = `SELECT p.*, s.full_name as student_name, s.student_id as student_code,
             pm.method_type FROM payments p
             LEFT JOIN students s ON s.id = p.student_id
             LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
             WHERE 1=1`;
    const params: unknown[] = [];
    if (student_id) { params.push(student_id); q += ` AND p.student_id=$${params.length}`; }
    if (status) { params.push(status); q += ` AND p.status=$${params.length}`; }
    if (start_date) { params.push(start_date); q += ` AND p.payment_date>=$${params.length}`; }
    if (end_date) { params.push(end_date); q += ` AND p.payment_date<=$${params.length}`; }
    q += ' ORDER BY p.created_at DESC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST /api/payments
router.post('/', authorize('super_admin', 'admin', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, enrollment_id, payment_method_id, amount, payment_date, transaction_reference, notes } = req.body;
    if (!student_id || !amount) { res.status(400).json({ success: false, message: 'student_id and amount required' }); return; }
    const result = await query(
      `INSERT INTO payments (student_id, enrollment_id, payment_method_id, amount, payment_date, transaction_reference, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [student_id, enrollment_id || null, payment_method_id || null, amount, payment_date || new Date().toISOString().split('T')[0], transaction_reference || null, notes || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/payments/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT p.*, s.full_name as student_name, s.student_id as student_code, pm.method_type FROM payments p
       LEFT JOIN students s ON s.id = p.student_id
       LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
       WHERE p.id=$1`, [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// PUT /api/payments/:id — Edit a payment record
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, enrollment_id, payment_method_id, amount, payment_date, transaction_reference, notes, status } = req.body;
    const existing = await query('SELECT id FROM payments WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ success: false, message: 'Payment not found' }); return; }
    if (!student_id || !amount) { res.status(400).json({ success: false, message: 'student_id and amount required' }); return; }
    const result = await query(
      `UPDATE payments SET student_id=$1, enrollment_id=$2, payment_method_id=$3, amount=$4,
        payment_date=$5, transaction_reference=$6, notes=$7, status=$8
       WHERE id=$9 RETURNING *`,
      [
        student_id,
        enrollment_id || null,
        payment_method_id || null,
        amount,
        payment_date || new Date().toISOString().split('T')[0],
        transaction_reference || null,
        notes || null,
        status || 'pending',
        req.params.id,
      ]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// PATCH /api/payments/:id/verify
router.patch('/:id/verify', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, notes } = req.body;
    if (!['verified', 'rejected'].includes(status)) { res.status(400).json({ success: false, message: 'Status must be verified or rejected' }); return; }
    const result = await query(
      `UPDATE payments SET status=$1, notes=$2, verified_by=$3, verified_at=NOW() WHERE id=$4 RETURNING *`,
      [status, notes || null, req.user!.id, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;
