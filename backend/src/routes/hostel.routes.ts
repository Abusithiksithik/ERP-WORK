import { Router, Response } from 'express';
import { pool, query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const dateValue = (value: unknown): string | null => {
  if (!value) return null;
  const s = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const ensurePeriod = async (
  hostelRecordId: number,
  studentId: number,
  periodFrom: string,
  periodTo: string,
  hostelFee: number,
  messFee: number,
  notes: string | null,
) => {
  const existing = await query(
    `SELECT * FROM hostel_fee_periods
     WHERE hostel_record_id=$1 AND start_date=$2::date AND end_date=$3::date
     ORDER BY id DESC LIMIT 1`,
    [hostelRecordId, periodFrom, periodTo]
  );

  if (existing.rows.length) {
    const result = await query(
      `UPDATE hostel_fee_periods
       SET start_date=$1::date, end_date=$2::date,
           hostel_fee=$3, mess_fee=$4, notes=$5, updated_at=NOW()
       WHERE id=$6
       RETURNING *`,
      [periodFrom, periodTo, hostelFee, messFee, notes, existing.rows[0].id]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO hostel_fee_periods
       (hostel_record_id, student_id, start_date, end_date, hostel_fee, mess_fee, discount, notes)
     VALUES ($1,$2,$3::date,$4::date,$5,$6,0,$7)
     RETURNING *`,
    [hostelRecordId, studentId, periodFrom, periodTo, hostelFee, messFee, notes]
  );
  return result.rows[0];
};

// GET /api/hostel — students with the fee period selected by the UI.
router.get('/', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const { search } = req.query;
    const periodFrom = dateValue(req.query.period_from) || new Date().toISOString().slice(0, 10);
    const periodTo = dateValue(req.query.period_to) || periodFrom;

    let q = `
      SELECT
        hr.id AS hostel_record_id,
        s.id AS student_id,
        s.student_id AS student_code,
        s.full_name,
        s.mobile,
        c.course_name,
        b.batch_name,
        fp.id AS period_id,
        TO_CHAR(fp.start_date, 'YYYY-MM-DD') AS period_from,
        TO_CHAR(fp.end_date, 'YYYY-MM-DD') AS period_to,
        COALESCE(fp.hostel_fee, 0)::numeric AS hostel_fee,
        COALESCE(fp.mess_fee, 0)::numeric AS mess_fee,
        (COALESCE(fp.hostel_fee, 0) + COALESCE(fp.mess_fee, 0))::numeric AS total_fee,
        COALESCE(fp.discount, 0)::numeric AS discount,
        COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp
          WHERE hp.hostel_record_id = hr.id AND hp.period_id = fp.id), 0)::numeric AS paid_amount,
        GREATEST(
          COALESCE(fp.hostel_fee, 0) + COALESCE(fp.mess_fee, 0)
          - COALESCE(fp.discount, 0)
          - COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp
             WHERE hp.hostel_record_id = hr.id AND hp.period_id = fp.id), 0),
          0
        )::numeric AS pending_balance,
        COALESCE(fp.notes, hr.notes) AS notes
      FROM hostel_records hr
      JOIN students s ON s.id = hr.student_id
      LEFT JOIN courses c ON c.id = s.course_id
      LEFT JOIN batches b ON b.id = s.batch_id
      LEFT JOIN LATERAL (
        SELECT hfp.*
        FROM hostel_fee_periods hfp
        WHERE hfp.hostel_record_id = hr.id
          AND hfp.start_date = $1::date
          AND hfp.end_date = $2::date
        ORDER BY hfp.id DESC
        LIMIT 1
      ) fp ON TRUE
      WHERE s.accommodation_type = 'hostel'
        AND s.status NOT IN ('discontinued')
    `;

    const params: unknown[] = [periodFrom, periodTo];
    if (search) {
      params.push(`%${String(search).trim()}%`);
      q += ` AND (s.full_name ILIKE $${params.length} OR s.student_id ILIKE $${params.length} OR s.mobile ILIKE $${params.length})`;
    }
    q += ' ORDER BY s.full_name ASC';

    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /hostel error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/hostel/bulk-period — set one period for every active hostel student.
router.post('/bulk-period', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const from = dateValue(req.body?.period_from);
    const to = dateValue(req.body?.period_to);
    const hf = parseFloat(req.body?.hostel_fee);
    const mf = parseFloat(req.body?.mess_fee);
    if (!from || !to || from > to || !Number.isFinite(hf) || hf < 0 || !Number.isFinite(mf) || mf < 0) {
      res.status(400).json({ success: false, message: 'Valid period and fee amounts are required' });
      return;
    }

    const students = await query(
      `SELECT hr.id AS hostel_record_id, hr.student_id, hr.notes
       FROM hostel_records hr
       JOIN students s ON s.id=hr.student_id
       WHERE s.accommodation_type='hostel' AND s.status <> 'discontinued'`
    );

    for (const row of students.rows) {
      await ensurePeriod(row.hostel_record_id, row.student_id, from, to, hf, mf, row.notes || null);
      await query(
        `UPDATE hostel_records SET hostel_fee=$1, mess_fee=$2, notes=COALESCE($3,notes) WHERE id=$4`,
        [hf, mf, row.notes || null, row.hostel_record_id]
      );
    }

    res.status(201).json({ success: true, data: { count: students.rows.length, period_from: from, period_to: to } });
  } catch (err) {
    console.error('POST /hostel/bulk-period error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/hostel/:id/payments — payment history, optionally for one period.
router.get('/:id/payments', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }
    const periodId = req.query.period_id ? parseInt(String(req.query.period_id), 10) : null;
    const result = await query(
      `SELECT hp.id, hp.amount::numeric AS amount, hp.payment_date, hp.payment_method,
              hp.reference, hp.notes, hp.created_at, hp.period_id,
              u.full_name AS recorded_by_name
       FROM hostel_payments hp
       LEFT JOIN users u ON u.id = hp.recorded_by
       WHERE hp.hostel_record_id = $1
         AND ($2::integer IS NULL OR hp.period_id = $2)
       ORDER BY hp.payment_date DESC, hp.created_at DESC`,
      [id, periodId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /hostel/:id/payments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/hostel/:id/payments — record payment against the selected fee period.
router.post('/:id/payments', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }
    const { amount, payment_date, payment_method, reference, notes, period_id, period_from, period_to } = req.body;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
      return;
    }

    const hrResult = await query(
      `SELECT hr.id, hr.student_id, hr.hostel_fee, hr.mess_fee, hr.notes
       FROM hostel_records hr JOIN students s ON s.id=hr.student_id
       WHERE hr.id=$1 AND s.accommodation_type='hostel'`, [id]
    );
    if (!hrResult.rows.length) {
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }
    const hr = hrResult.rows[0];

    let selectedPeriodId = Number(period_id) || null;
    if (!selectedPeriodId) {
      const from = dateValue(period_from);
      const to = dateValue(period_to);
      if (!from || !to || from > to) {
        res.status(400).json({ success: false, message: 'Valid fee period is required' });
        return;
      }
      const period = await ensurePeriod(id, hr.student_id, from, to, Number(hr.hostel_fee || 0), Number(hr.mess_fee || 0), hr.notes || null);
      selectedPeriodId = period.id;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO hostel_payments
          (hostel_record_id, student_id, period_id, amount, payment_date, payment_method, reference, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, hr.student_id, selectedPeriodId, amt, payment_date || new Date().toISOString().split('T')[0], payment_method || 'cash', reference || null, notes || null, req.user!.id]
      );
      await client.query(
        `UPDATE hostel_records SET paid_amount = (
           SELECT COALESCE(SUM(amount),0) FROM hostel_payments WHERE hostel_record_id=$1
         ) WHERE id=$1`, [id]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  const updated = await query(
  `SELECT fp.id AS period_id,
          fp.hostel_fee::numeric,
          fp.mess_fee::numeric,
          (fp.hostel_fee + fp.mess_fee)::numeric AS total_fee,
          0::numeric AS discount,
          COALESCE(
            (SELECT SUM(hp.amount)
             FROM hostel_payments hp
             WHERE hp.period_id = fp.id),
            0
          )::numeric AS paid_amount,
          GREATEST(
            fp.hostel_fee + fp.mess_fee
            - COALESCE(
                (SELECT SUM(hp.amount)
                 FROM hostel_payments hp
                 WHERE hp.period_id = fp.id),
                0
              ),
            0
          )::numeric AS pending_balance
   FROM hostel_fee_periods fp
   WHERE fp.id = $1`,
  [selectedPeriodId]
);
    res.status(201).json({ success: true, message: 'Payment recorded successfully', data: updated.rows[0] || null });
  } catch (err) {
    console.error('POST /hostel/:id/payments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/hostel/:id — current selected/active period detail.
router.get('/:id', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }
    const result = await query(
      `SELECT hr.id AS hostel_record_id, s.id AS student_id, s.student_id AS student_code, s.full_name,
              s.mobile, c.course_name, b.batch_name, fp.id AS period_id,
              TO_CHAR(fp.start_date,'YYYY-MM-DD') AS period_from, TO_CHAR(fp.end_date,'YYYY-MM-DD') AS period_to,
              COALESCE(fp.hostel_fee,0)::numeric AS hostel_fee, COALESCE(fp.mess_fee,0)::numeric AS mess_fee,
              (COALESCE(fp.hostel_fee,0)+COALESCE(fp.mess_fee,0))::numeric AS total_fee,
              COALESCE(fp.discount,0)::numeric AS discount,
              COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id),0)::numeric AS paid_amount,
              GREATEST(COALESCE(fp.hostel_fee,0)+COALESCE(fp.mess_fee,0)-COALESCE(fp.discount,0)-COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id),0),0)::numeric AS pending_balance,
              COALESCE(fp.notes,hr.notes) AS notes
       FROM hostel_records hr JOIN students s ON s.id=hr.student_id
       LEFT JOIN courses c ON c.id=s.course_id LEFT JOIN batches b ON b.id=s.batch_id
       LEFT JOIN LATERAL (SELECT hfp.* FROM hostel_fee_periods hfp WHERE hfp.hostel_record_id=hr.id AND CURRENT_DATE BETWEEN hfp.start_date AND hfp.end_date ORDER BY hfp.start_date DESC,hfp.id DESC LIMIT 1) fp ON TRUE
       WHERE hr.id=$1 AND s.accommodation_type='hostel'`, [id]
    );
    if (!result.rows.length) {
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /hostel/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/hostel/:id/discount — discount for the selected period.
router.post('/:id/discount', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const discountAmt = parseFloat(req.body?.discount);
    if (isNaN(id) || !Number.isFinite(discountAmt) || discountAmt < 0) {
      res.status(400).json({ success: false, message: 'Valid discount is required' });
      return;
    }

    let periodId = Number(req.body?.period_id) || null;
    if (!periodId) {
      const from = dateValue(req.body?.period_from);
      const to = dateValue(req.body?.period_to);
      if (!from || !to || from > to) {
        res.status(400).json({ success: false, message: 'Valid fee period is required' });
        return;
      }
      const hrResult = await query('SELECT student_id, hostel_fee, mess_fee, notes FROM hostel_records WHERE id=$1', [id]);
      if (!hrResult.rows.length) {
        res.status(404).json({ success: false, message: 'Hostel record not found' });
        return;
      }
      const hr = hrResult.rows[0];
      const period = await ensurePeriod(id, hr.student_id, from, to, Number(hr.hostel_fee || 0), Number(hr.mess_fee || 0), hr.notes || null);
      periodId = period.id;
    }

    const result = await query(
      `UPDATE hostel_fee_periods fp
       SET discount = LEAST($1::numeric, fp.hostel_fee + fp.mess_fee), updated_at=NOW()
       WHERE fp.id=$2
       RETURNING id AS period_id, hostel_fee::numeric, mess_fee::numeric,
         (hostel_fee+mess_fee)::numeric AS total_fee, discount::numeric,
         COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id),0)::numeric AS paid_amount,
         GREATEST(hostel_fee+mess_fee-discount-COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id),0),0)::numeric AS pending_balance`,
      [discountAmt, periodId]
    );
    if (!result.rows.length) {
      res.status(404).json({ success: false, message: 'Fee period not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /hostel/:id/discount error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/hostel/:id — create/update a fee period (bulk and individual both use this).
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const hf = parseFloat(req.body?.hostel_fee);
    const mf = parseFloat(req.body?.mess_fee);
    const from = dateValue(req.body?.period_from);
    const to = dateValue(req.body?.period_to);
    if (isNaN(id) || !Number.isFinite(hf) || hf < 0 || !Number.isFinite(mf) || mf < 0) {
      res.status(400).json({ success: false, message: 'Valid hostel and mess fees are required' });
      return;
    }
    if (!from || !to || from > to) {
      res.status(400).json({ success: false, message: 'Valid fee period from/to dates are required' });
      return;
    }

    const hrResult = await query('SELECT student_id FROM hostel_records WHERE id=$1', [id]);
    if (!hrResult.rows.length) {
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }
    const period = await ensurePeriod(id, hrResult.rows[0].student_id, from, to, hf, mf, req.body?.notes || null);
    const result = await query(
      `UPDATE hostel_fee_periods
       SET discount = LEAST(COALESCE(discount,0), $1::numeric + $2::numeric), updated_at=NOW()
       WHERE id=$3
       RETURNING id AS period_id, hostel_fee::numeric, mess_fee::numeric,
         (hostel_fee+mess_fee)::numeric AS total_fee, discount::numeric,
         COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=hostel_fee_periods.id),0)::numeric AS paid_amount,
         GREATEST(hostel_fee+mess_fee-discount-COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=hostel_fee_periods.id),0),0)::numeric AS pending_balance,
         notes, TO_CHAR(start_date,'YYYY-MM-DD') AS period_from, TO_CHAR(end_date,'YYYY-MM-DD') AS period_to`,
      [hf, mf, period.id]
    );
    // Keep legacy fields in sync for older screens/logic; period data remains the source for monthly tracking.
    // Keep only the legacy fee/notes fields in sync. Monthly discount belongs to
    // hostel_fee_periods; do not write it back to hostel_records because older
    // databases may have that legacy column as INTEGER.
    await query(
      `UPDATE hostel_records SET hostel_fee=$1, mess_fee=$2, notes=$3 WHERE id=$4`,
      [hf, mf, req.body?.notes || null, id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /hostel/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
