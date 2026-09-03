import { Router, Response } from 'express';
import { pool, query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: recompute paid_amount on hostel_records from the sum of hostel_payments
// ─────────────────────────────────────────────────────────────────────────────
async function syncPaidAmount(hostelRecordId: number): Promise<void> {
  await query(
    `UPDATE hostel_records
     SET paid_amount = (
       SELECT COALESCE(SUM(amount), 0)
       FROM hostel_payments
       WHERE hostel_record_id = $1
     )
     WHERE id = $1`,
    [hostelRecordId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/hostel  — list all active hostel students
// Only students with accommodation_type = 'hostel' are shown.
// Day Scholar students are excluded even if a hostel_record exists for them.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const { search } = req.query;

    let q = `
      SELECT
        hr.id                                                              AS hostel_record_id,
        s.id                                                               AS student_id,
        s.student_id                                                       AS student_code,
        s.full_name,
        s.mobile,
        c.course_name,
        b.batch_name,
        COALESCE(hr.hostel_fee, 0)::numeric                               AS hostel_fee,
        COALESCE(hr.mess_fee,   0)::numeric                               AS mess_fee,
        (COALESCE(hr.hostel_fee, 0) + COALESCE(hr.mess_fee, 0))::numeric  AS total_fee,
        COALESCE(hr.discount,   0)::numeric                               AS discount,
        COALESCE(hr.paid_amount, 0)::numeric                              AS paid_amount,
        GREATEST(COALESCE(hr.hostel_fee, 0) + COALESCE(hr.mess_fee, 0)
          - COALESCE(hr.discount, 0)
          - COALESCE(hr.paid_amount, 0), 0)::numeric                      AS pending_balance,
        hr.notes,
        hr.created_at,
        hr.updated_at
      FROM hostel_records hr
      JOIN students s ON s.id = hr.student_id
      LEFT JOIN courses c ON c.id = s.course_id
      LEFT JOIN batches b ON b.id = s.batch_id
      WHERE s.accommodation_type = 'hostel'
        AND s.status NOT IN ('discontinued')
    `;

    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (
        s.full_name  ILIKE $${params.length} OR
        s.student_id ILIKE $${params.length} OR
        s.mobile     ILIKE $${params.length}
      )`;
    }

    q += ' ORDER BY s.full_name ASC';

    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /hostel error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: /:id/payments routes MUST be declared before /:id to avoid Express
// routing /5/payments into the /:id handler (even though Express segments
// correctly, explicit ordering avoids any ambiguity).
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/hostel/:id/payments  — payment history for one hostel record
router.get('/:id/payments', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }

    const result = await query(
      `SELECT
         hp.id,
         hp.amount::numeric          AS amount,
         hp.payment_date,
         hp.payment_method,
         hp.reference,
         hp.notes,
         hp.created_at,
         u.full_name                 AS recorded_by_name
       FROM hostel_payments hp
       LEFT JOIN users u ON u.id = hp.recorded_by
       WHERE hp.hostel_record_id = $1
       ORDER BY hp.payment_date DESC, hp.created_at DESC`,
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /hostel/:id/payments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/hostel/:id/payments  — record a new payment
router.post('/:id/payments', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }

    const { amount, payment_date, payment_method, reference, notes } = req.body;

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
      return;
    }

    // Verify hostel record exists and fetch student_id in one query
    const hrResult = await query(
      `SELECT hr.id, hr.student_id
       FROM hostel_records hr
       JOIN students s ON s.id = hr.student_id
       WHERE hr.id = $1 AND s.accommodation_type = 'hostel'`,
      [id]
    );
    if (hrResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }
    const { student_id } = hrResult.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO hostel_payments
           (hostel_record_id, student_id, amount, payment_date, payment_method, reference, notes, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          student_id,
          amt,
          payment_date || new Date().toISOString().split('T')[0],
          payment_method || 'cash',
          reference  || null,
          notes      || null,
          req.user!.id,
        ]
      );

      // Recalculate paid_amount atomically
      await client.query(
        `UPDATE hostel_records
         SET paid_amount = (
           SELECT COALESCE(SUM(amount), 0) FROM hostel_payments WHERE hostel_record_id = $1
         )
         WHERE id = $1`,
        [id]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Return the updated hostel record so the frontend can refresh
    const updated = await query(
      `SELECT
         hr.id AS hostel_record_id,
         COALESCE(hr.hostel_fee,  0)::numeric AS hostel_fee,
         COALESCE(hr.mess_fee,    0)::numeric AS mess_fee,
         (COALESCE(hr.hostel_fee,0)+COALESCE(hr.mess_fee,0))::numeric AS total_fee,
         COALESCE(hr.discount, 0)::numeric AS discount,
         COALESCE(hr.paid_amount, 0)::numeric AS paid_amount,
         GREATEST(COALESCE(hr.hostel_fee,0)+COALESCE(hr.mess_fee,0)-COALESCE(hr.discount,0)-COALESCE(hr.paid_amount,0),0)::numeric AS pending_balance
       FROM hostel_records hr WHERE hr.id = $1`,
      [id]
    );

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: updated.rows[0] || null,
    });
  } catch (err) {
    console.error('POST /hostel/:id/payments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/hostel/:id  — single hostel record detail
router.get('/:id', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }

    const result = await query(
      `SELECT
         hr.id                                                             AS hostel_record_id,
         s.id                                                              AS student_id,
         s.student_id                                                      AS student_code,
         s.full_name,
         s.mobile,
         c.course_name,
         b.batch_name,
         COALESCE(hr.hostel_fee,  0)::numeric                             AS hostel_fee,
         COALESCE(hr.mess_fee,    0)::numeric                             AS mess_fee,
         (COALESCE(hr.hostel_fee,0)+COALESCE(hr.mess_fee,0))::numeric     AS total_fee,
         COALESCE(hr.discount,    0)::numeric                             AS discount,
         COALESCE(hr.paid_amount, 0)::numeric                             AS paid_amount,
         GREATEST(COALESCE(hr.hostel_fee,0)+COALESCE(hr.mess_fee,0)
           -COALESCE(hr.discount,0)
           -COALESCE(hr.paid_amount,0),0)::numeric                        AS pending_balance,
         hr.notes,
         hr.updated_at
       FROM hostel_records hr
       JOIN students s ON s.id = hr.student_id
       LEFT JOIN courses c ON c.id = s.course_id
       LEFT JOIN batches b ON b.id = s.batch_id
       WHERE hr.id = $1
         AND s.accommodation_type = 'hostel'`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /hostel/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/hostel/:id/discount — apply a per-student discount
router.post('/:id/discount', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }
    const { discount } = req.body;
    const discountAmt = parseFloat(discount);
    if (isNaN(discountAmt) || discountAmt < 0) {
      res.status(400).json({ success: false, message: 'Discount must be 0 or more' });
      return;
    }
    const result = await query(
      `UPDATE hostel_records
       SET discount = $1
       WHERE id = $2
       RETURNING
         id AS hostel_record_id,
         hostel_fee::numeric,
         mess_fee::numeric,
         (hostel_fee + mess_fee)::numeric AS total_fee,
         discount::numeric,
         paid_amount::numeric,
         GREATEST((hostel_fee + mess_fee) - COALESCE(discount,0) - COALESCE(paid_amount,0), 0)::numeric AS pending_balance`,
      [discountAmt, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /hostel/:id/discount error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/hostel/:id  — update hostel_fee and/or mess_fee
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }

    const { hostel_fee, mess_fee, notes } = req.body;

    const hf = parseFloat(hostel_fee);
    const mf = parseFloat(mess_fee);

    if (isNaN(hf) || hf < 0) {
      res.status(400).json({ success: false, message: 'Hostel fee must be 0 or more' });
      return;
    }
    if (isNaN(mf) || mf < 0) {
      res.status(400).json({ success: false, message: 'Mess fee must be 0 or more' });
      return;
    }

    const result = await query(
      `UPDATE hostel_records
       SET hostel_fee = $1,
           mess_fee   = $2,
           notes      = $3
       WHERE id = $4
       RETURNING
         id AS hostel_record_id,
         hostel_fee::numeric,
         mess_fee::numeric,
         (hostel_fee + mess_fee)::numeric              AS total_fee,
         paid_amount::numeric,
         (hostel_fee + mess_fee - paid_amount)::numeric AS pending_balance,
         notes,
         updated_at`,
      [hf, mf, notes || null, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /hostel/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
