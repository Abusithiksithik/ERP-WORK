import { Router, Response } from 'express';
import { pool, query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Helper: recompute paid_amount on exam_fee_records from the sum of exam_fee_payments
async function syncPaidAmount(recordId: number): Promise<void> {
  await query(
    `UPDATE exam_fee_records
     SET paid_amount = (
       SELECT COALESCE(SUM(amount), 0)
       FROM exam_fee_payments
       WHERE exam_fee_record_id = $1
     )
     WHERE id = $1`,
    [recordId]
  );
}

// Helper: auto-create exam_fee_records for eligible candidates who don't have one yet
async function autoCreateRecords(client: any): Promise<void> {
  // For each active student with approved enrollment and no existing record
  await client.query(`
    INSERT INTO exam_fee_records (student_id, exam_fee, other_fee, other_fee_note)
    SELECT
      s.id,
      COALESCE(efs.exam_fee, 0),
      COALESCE(efs.other_fee, 0),
      efs.other_fee_note
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
    LEFT JOIN exam_fee_settings efs
      ON efs.course_id = s.course_id
      AND efs.category_id = (SELECT category_id FROM courses WHERE id = s.course_id LIMIT 1)
    WHERE s.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM exam_fee_records WHERE student_id = s.id
      )
    ON CONFLICT DO NOTHING
  `);
}

// ─── GET /api/exam-fees/settings — list all fee settings (category+course level) ───
router.get('/settings', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, course_id } = req.query;
    let q = `
      SELECT efs.*, cc.category_name, c.course_name
      FROM exam_fee_settings efs
      LEFT JOIN course_categories cc ON cc.id = efs.category_id
      LEFT JOIN courses c ON c.id = efs.course_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (category_id) { params.push(category_id); q += ` AND efs.category_id=$${params.length}`; }
    if (course_id)   { params.push(course_id);   q += ` AND efs.course_id=$${params.length}`;   }
    q += ' ORDER BY cc.category_name, c.course_name';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /exam-fees/settings error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/exam-fees/settings — set common exam fee for a category+course ───
router.post('/settings', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { category_id, course_id, exam_fee, other_fee, other_fee_note, notes } = req.body;
    if (!course_id) {
      res.status(400).json({ success: false, message: 'course_id is required' });
      return;
    }

    await client.query('BEGIN');

    // Upsert the fee setting
    const result = await client.query(
      `INSERT INTO exam_fee_settings (category_id, course_id, exam_fee, other_fee, other_fee_note, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (category_id, course_id)
       DO UPDATE SET exam_fee=$3, other_fee=$4, other_fee_note=$5, notes=$6, updated_at=NOW()
       RETURNING *`,
      [
        category_id || null,
        course_id,
        Number(exam_fee) || 0,
        Number(other_fee) || 0,
        other_fee_note || null,
        notes || null,
        req.user!.id,
      ]
    );

    // Sync exam_fee to existing student records for this course
    await client.query(
      `UPDATE exam_fee_records
       SET exam_fee = $1, other_fee = $2, other_fee_note = $3
       FROM students s
       WHERE exam_fee_records.student_id = s.id
         AND s.course_id = $4`,
      [
        Number(exam_fee) || 0,
        Number(other_fee) || 0,
        other_fee_note || null,
        course_id,
      ]
    );

    // Auto-create records for eligible candidates not yet in exam_fee_records
    await autoCreateRecords(client);

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /exam-fees/settings error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/exam-fees/settings/:id — update exam fee setting ───
router.put('/settings/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { exam_fee, other_fee, other_fee_note, notes } = req.body;

    await client.query('BEGIN');

    // Get the course_id for this setting
    const settingRes = await client.query(
      'SELECT * FROM exam_fee_settings WHERE id=$1',
      [req.params.id]
    );
    if (settingRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Fee setting not found' });
      return;
    }
    const setting = settingRes.rows[0];

    const result = await client.query(
      `UPDATE exam_fee_settings
       SET exam_fee=$1, other_fee=$2, other_fee_note=$3, notes=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [
        Number(exam_fee) || 0,
        Number(other_fee) || 0,
        other_fee_note || null,
        notes || null,
        req.params.id,
      ]
    );

    // Sync to student records for this course
    await client.query(
      `UPDATE exam_fee_records
       SET exam_fee = $1, other_fee = $2, other_fee_note = $3
       FROM students s
       WHERE exam_fee_records.student_id = s.id
         AND s.course_id = $4`,
      [
        Number(exam_fee) || 0,
        Number(other_fee) || 0,
        other_fee_note || null,
        setting.course_id,
      ]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /exam-fees/settings/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── GET /api/exam-fees — list eligible active candidates with approved enrollment ───
// Filters: category_id, course_id, search
router.get('/', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { search, category_id, course_id } = req.query;

    // Auto-create records for newly eligible candidates
    await autoCreateRecords(client);

    let q = `
      SELECT
        efr.id                                                              AS exam_fee_record_id,
        s.id                                                                AS student_id,
        s.student_id                                                        AS student_code,
        s.full_name,
        s.mobile,
        cc.id                                                               AS category_id,
        cc.category_name,
        c.id                                                                AS course_id,
        c.course_name,
        b.batch_name,
        COALESCE(efr.exam_fee, 0)::numeric                                  AS exam_fee,
        COALESCE(efr.other_fee, 0)::numeric                                 AS other_fee,
        COALESCE(efr.other_fee_note, '')                                    AS other_fee_note,
        (COALESCE(efr.exam_fee, 0) + COALESCE(efr.other_fee, 0))::numeric  AS total_fee,
<<<<<<< HEAD
        COALESCE(efr.discount, 0)::numeric                                  AS discount,
        COALESCE(efr.paid_amount, 0)::numeric                               AS paid_amount,
        GREATEST(
          (COALESCE(efr.exam_fee, 0) + COALESCE(efr.other_fee, 0))
          - COALESCE(efr.discount, 0)
=======
        COALESCE(efr.paid_amount, 0)::numeric                               AS paid_amount,
        GREATEST(
          (COALESCE(efr.exam_fee, 0) + COALESCE(efr.other_fee, 0))
>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960
          - COALESCE(efr.paid_amount, 0), 0
        )::numeric                                                           AS pending_balance,
        efr.notes,
        efr.created_at,
        efr.updated_at
      FROM exam_fee_records efr
      JOIN students s ON s.id = efr.student_id
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
      LEFT JOIN courses c ON c.id = s.course_id
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      LEFT JOIN batches b ON b.id = s.batch_id
      WHERE s.status = 'active'
    `;

    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (s.full_name ILIKE $${params.length} OR s.student_id ILIKE $${params.length})`;
    }
    if (category_id) {
      params.push(category_id);
      q += ` AND cc.id = $${params.length}`;
    }
    if (course_id) {
      params.push(course_id);
      q += ` AND c.id = $${params.length}`;
    }

    q += ' ORDER BY cc.category_name, c.course_name, s.full_name ASC';
    const result = await client.query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /exam-fees error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── GET /api/exam-fees/categories — categories that have active candidates ───
router.get('/categories', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT DISTINCT cc.id, cc.category_name
      FROM course_categories cc
      JOIN courses c ON c.category_id = cc.id
      JOIN students s ON s.course_id = c.id AND s.status = 'active'
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
      ORDER BY cc.category_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /exam-fees/categories error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/exam-fees/courses — courses filtered by category ───
router.get('/courses', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const { category_id } = req.query;
    let q = `
      SELECT DISTINCT c.id, c.course_name, c.category_id, cc.category_name
      FROM courses c
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      JOIN students s ON s.course_id = c.id AND s.status = 'active'
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (category_id) {
      params.push(category_id);
      q += ` AND c.category_id = $${params.length}`;
    }
    q += ' ORDER BY c.course_name';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /exam-fees/courses error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── PUT /api/exam-fees/:id — update individual exam fee record (per-student override) ───
router.put('/:id', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const { exam_fee, other_fee, other_fee_note, notes } = req.body;
    const result = await query(
      `UPDATE exam_fee_records
       SET exam_fee=$1, other_fee=$2, other_fee_note=$3, notes=$4
       WHERE id=$5 RETURNING *`,
      [
        Number(exam_fee) || 0,
        Number(other_fee) || 0,
        other_fee_note || null,
        notes || null,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /exam-fees/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE /api/exam-fees/:id ───
router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM exam_fee_records WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Exam fee record deleted' });
  } catch (err) {
    console.error('DELETE /exam-fees/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/exam-fees/:id/payments — get payment history ───
router.get('/:id/payments', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT efp.*, u.full_name AS recorded_by_name
       FROM exam_fee_payments efp
       LEFT JOIN users u ON u.id = efp.recorded_by
       WHERE efp.exam_fee_record_id = $1
       ORDER BY efp.payment_date DESC, efp.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /exam-fees/:id/payments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/exam-fees/:id/payments — add a payment ───
router.post('/:id/payments', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { amount, payment_date, payment_method, reference, notes } = req.body;
    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ success: false, message: 'A positive amount is required' });
      return;
    }
    const recordRes = await client.query(
      'SELECT * FROM exam_fee_records WHERE id = $1',
      [req.params.id]
    );
    if (recordRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Exam fee record not found' });
      return;
    }
    const record = recordRes.rows[0];

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO exam_fee_payments
         (exam_fee_record_id, student_id, amount, payment_date, payment_method, reference, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.params.id,
        record.student_id,
        Number(amount),
        payment_date || new Date().toISOString().split('T')[0],
        payment_method || 'cash',
        reference || null,
        notes || null,
        req.user!.id,
      ]
    );
    // Sync paid amount for THIS student's record only
    await client.query(
      `UPDATE exam_fee_records
       SET paid_amount = (
         SELECT COALESCE(SUM(amount), 0) FROM exam_fee_payments WHERE exam_fee_record_id = $1
       )
       WHERE id = $1`,
      [req.params.id]
    );
    await client.query('COMMIT');

    const updated = await query(
      `SELECT efr.*,
         s.full_name, s.student_id AS student_code,
         c.course_name, b.batch_name,
         (COALESCE(efr.exam_fee,0) + COALESCE(efr.other_fee,0)) AS total_fee,
<<<<<<< HEAD
         COALESCE(efr.discount,0) AS discount,
         GREATEST((COALESCE(efr.exam_fee,0)+COALESCE(efr.other_fee,0))-COALESCE(efr.discount,0)-COALESCE(efr.paid_amount,0),0) AS pending_balance
=======
         GREATEST((COALESCE(efr.exam_fee,0)+COALESCE(efr.other_fee,0))-COALESCE(efr.paid_amount,0),0) AS pending_balance
>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960
       FROM exam_fee_records efr
       JOIN students s ON s.id = efr.student_id
       LEFT JOIN courses c ON c.id = s.course_id
       LEFT JOIN batches b ON b.id = s.batch_id
       WHERE efr.id = $1`,
      [req.params.id]
    );
    res.status(201).json({ success: true, data: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /exam-fees/:id/payments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

<<<<<<< HEAD
// ─── POST /api/exam-fees/:id/discount — apply a per-student discount ───
router.post('/:id/discount', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    if (isNaN(recordId)) {
      res.status(400).json({ success: false, message: 'Invalid exam fee record ID' });
      return;
    }
    const { discount } = req.body;
    const discountAmt = parseFloat(discount);
    if (isNaN(discountAmt) || discountAmt < 0) {
      res.status(400).json({ success: false, message: 'Discount must be 0 or more' });
      return;
    }
    const result = await query(
      `UPDATE exam_fee_records
       SET discount = $1
       WHERE id = $2
       RETURNING
         id,
         student_id,
         exam_fee::numeric,
         other_fee::numeric,
         discount::numeric,
         paid_amount::numeric,
         (exam_fee + other_fee)::numeric AS total_fee,
         GREATEST((exam_fee + other_fee) - COALESCE(discount,0) - COALESCE(paid_amount,0), 0)::numeric AS pending_balance`,
      [discountAmt, recordId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Exam fee record not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /exam-fees/:id/discount error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

=======
>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960
// ─── DELETE /api/exam-fees/payments/:paymentId ───
router.delete('/payments/:paymentId', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const payRes = await client.query(
      'SELECT exam_fee_record_id FROM exam_fee_payments WHERE id = $1',
      [req.params.paymentId]
    );
    if (payRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Payment not found' });
      return;
    }
    const recordId = payRes.rows[0].exam_fee_record_id;

    await client.query('BEGIN');
    await client.query('DELETE FROM exam_fee_payments WHERE id = $1', [req.params.paymentId]);
    await client.query(
      `UPDATE exam_fee_records
       SET paid_amount = (SELECT COALESCE(SUM(amount),0) FROM exam_fee_payments WHERE exam_fee_record_id=$1)
       WHERE id=$1`,
      [recordId]
    );
    await client.query('COMMIT');
    res.json({ success: true, message: 'Payment deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /exam-fees/payments/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

export default router;
