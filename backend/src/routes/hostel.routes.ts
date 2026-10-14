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

const monthPeriod = (value: unknown): { from: string; to: string } | null => {
  const raw = String(value ?? '');
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [year, month] = raw.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
};


const durationInMonths = (value: unknown): number => {
  const raw = String(value ?? '').toLowerCase();
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(year|yr|month|mo)/);
  if (!match) return 12;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return 12;
  return /year|yr/.test(match[2]) ? Math.round(amount * 12) : Math.round(amount);
};

const monthDateRange = (year: number, month: number) => {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
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
     WHERE hostel_record_id=$1
       AND (start_date=$2::date AND end_date=$3::date
            OR period_from=$2::date AND period_to=$3::date)
     ORDER BY id DESC LIMIT 1`,
    [hostelRecordId, periodFrom, periodTo]
  );

  if (existing.rows.length) return existing.rows[0];

  const result = await query(
    `INSERT INTO hostel_fee_periods
       (hostel_record_id, student_id, period_from, period_to, start_date, end_date,
        hostel_fee, mess_fee, discount, notes)
     VALUES ($1,$2,$3::date,$4::date,$3::date,$4::date,$5,$6,0,$7)
     RETURNING *`,
    [hostelRecordId, studentId, periodFrom, periodTo, hostelFee, messFee, notes]
  );
  return result.rows[0];
};

// GET /api/hostel — students with the fee period selected by the UI.
router.get('/', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const { search } = req.query;
    const selectedMonth = monthPeriod(req.query.period_month);
    const periodFrom = selectedMonth?.from || dateValue(req.query.period_from) || new Date().toISOString().slice(0, 10);
    const periodTo = selectedMonth?.to || dateValue(req.query.period_to) || periodFrom;

    let q = `
      SELECT
        hr.id AS hostel_record_id,
        EXISTS (SELECT 1 FROM hostel_fee_schedules fs WHERE fs.hostel_record_id=hr.id AND fs.deleted_at IS NULL) AS has_fee_schedule,
        s.id AS student_id,
        s.student_id AS student_code,
        s.full_name,
        s.mobile,
        c.course_name,
        b.batch_name,
        TO_CHAR(COALESCE(s.admission_date, s.created_at::date), 'YYYY-MM-DD') AS joining_date,
        c.duration AS course_duration,
        fp.id AS period_id,
        TO_CHAR(fp.start_date, 'YYYY-MM-DD') AS period_from,
        TO_CHAR(fp.end_date, 'YYYY-MM-DD') AS period_to,
        COALESCE(fp.hostel_fee, 0)::numeric AS hostel_fee,
        COALESCE(fp.mess_fee, 0)::numeric AS mess_fee,
        (COALESCE(fp.hostel_fee, 0) + COALESCE(fp.mess_fee, 0))::numeric AS total_fee,
        COALESCE(fp.discount, 0)::numeric AS discount,
        COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp
          WHERE hp.hostel_record_id = hr.id AND (hp.period_id = fp.id OR (hp.period_id IS NULL AND hp.payment_date BETWEEN fp.start_date AND fp.end_date))), 0)::numeric AS paid_amount,
        GREATEST(
          COALESCE(fp.hostel_fee, 0) + COALESCE(fp.mess_fee, 0)
          - COALESCE(fp.discount, 0)
          - COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp
             WHERE hp.hostel_record_id = hr.id AND (hp.period_id = fp.id OR (hp.period_id IS NULL AND hp.payment_date BETWEEN fp.start_date AND fp.end_date))), 0),
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
        AND date_trunc('month', COALESCE(s.admission_date, s.created_at)::date) <= $1::date
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


// GET /api/hostel/:id/history — complete course fee schedule, payments, and fee revisions.
router.get('/:id/history', authorize('super_admin', 'admin', 'incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }

    const studentResult = await query(
      `SELECT hr.id AS hostel_record_id, hr.student_id, s.student_id AS student_code, s.full_name,
              c.course_name, c.duration AS course_duration,
              TO_CHAR(COALESCE(s.admission_date, s.created_at::date), 'YYYY-MM-DD') AS joining_date
       FROM hostel_records hr
       JOIN students s ON s.id = hr.student_id
       LEFT JOIN courses c ON c.id = s.course_id
       WHERE hr.id = $1 AND s.accommodation_type = 'hostel'`, [id]
    );
    if (!studentResult.rows.length) {
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }

    const scheduleResult = await query(
      `SELECT id, TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
              TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date, TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
       FROM hostel_fee_schedules WHERE hostel_record_id=$1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`, [id]
    );

    const periodsResult = await query(
      `SELECT fp.id AS period_id,
              TO_CHAR(fp.start_date, 'YYYY-MM-DD') AS period_from,
              TO_CHAR(fp.end_date, 'YYYY-MM-DD') AS period_to,
              COALESCE(fp.hostel_fee, 0)::numeric AS hostel_fee,
              COALESCE(fp.mess_fee, 0)::numeric AS mess_fee,
              (COALESCE(fp.hostel_fee, 0) + COALESCE(fp.mess_fee, 0))::numeric AS total_fee,
              COALESCE(fp.discount, 0)::numeric AS discount,
              COALESCE(SUM(hp.amount), 0)::numeric AS paid_amount,
              GREATEST(COALESCE(fp.hostel_fee, 0) + COALESCE(fp.mess_fee, 0)
                - COALESCE(fp.discount, 0) - COALESCE(SUM(hp.amount), 0), 0)::numeric AS pending_balance,
              COUNT(hp.id)::int AS payment_count
       FROM hostel_fee_periods fp
       LEFT JOIN hostel_payments hp ON (hp.period_id = fp.id OR (hp.period_id IS NULL AND hp.hostel_record_id=fp.hostel_record_id AND hp.payment_date BETWEEN fp.start_date AND fp.end_date))
       WHERE fp.hostel_record_id = $1
       GROUP BY fp.id
       ORDER BY fp.start_date ASC, fp.id ASC`, [id]
    );

    const paymentsResult = await query(
      `SELECT hp.id, hp.period_id, hp.amount::numeric AS amount,
              TO_CHAR(hp.payment_date, 'YYYY-MM-DD') AS payment_date, hp.payment_method,
              hp.reference, hp.notes, hp.created_at, u.full_name AS recorded_by_name,
              TO_CHAR(fp.start_date, 'YYYY-MM-DD') AS period_from,
              TO_CHAR(fp.end_date, 'YYYY-MM-DD') AS period_to
       FROM hostel_payments hp
       LEFT JOIN LATERAL (
         SELECT hfp.* FROM hostel_fee_periods hfp
         WHERE hfp.id = hp.period_id OR (hp.period_id IS NULL AND hfp.hostel_record_id=hp.hostel_record_id AND hp.payment_date BETWEEN hfp.start_date AND hfp.end_date)
         ORDER BY hfp.id DESC LIMIT 1
       ) fp ON TRUE
       LEFT JOIN users u ON u.id = hp.recorded_by
       WHERE hp.hostel_record_id = $1
       ORDER BY hp.payment_date ASC, hp.created_at ASC`, [id]
    );

    const revisionsResult = await query(
      `SELECT r.id, TO_CHAR(r.effective_from, 'YYYY-MM-DD') AS effective_from,
              TO_CHAR(r.effective_to, 'YYYY-MM-DD') AS effective_to,
              r.previous_hostel_fee::numeric, r.previous_mess_fee::numeric,
              r.new_hostel_fee::numeric, r.new_mess_fee::numeric, r.notes, r.created_at,
              u.full_name AS changed_by_name
       FROM hostel_fee_revisions r
       LEFT JOIN users u ON u.id = r.changed_by
       WHERE r.hostel_record_id = $1
       ORDER BY r.effective_from ASC, r.created_at ASC, r.id ASC`, [id]
    );

    const periods = periodsResult.rows;
    const totalFee = periods.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.total_fee || 0) - Number(row.discount || 0)), 0);
    const totalPaid = periods.reduce((sum: number, row: any) => sum + Number(row.paid_amount || 0), 0);
    const totalPending = Math.max(0, totalFee - totalPaid);
    res.json({
      success: true,
      data: {
        student: studentResult.rows[0],
        active_schedule: scheduleResult.rows[0] || null,
        summary: { months: periods.length, total_fee: totalFee, total_paid: totalPaid, total_pending: totalPending },
        periods, payments: paymentsResult.rows, revisions: revisionsResult.rows,
      },
    });
  } catch (err) {
    console.error('GET /hostel/:id/history error:', err);
    res.status(500).json({ success: false, message: 'Failed to load hostel fee history' });
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
    const { amount, payment_date, payment_method, reference, notes, period_id, period_month, period_from, period_to } = req.body;
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
      const selectedMonth = monthPeriod(period_month);
      const from = selectedMonth?.from || dateValue(period_from);
      const to = selectedMonth?.to || dateValue(period_to);
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
      const periodCheck = await client.query(
        'SELECT id FROM hostel_fee_periods WHERE id=$1 AND hostel_record_id=$2 FOR UPDATE',
        [selectedPeriodId, id]
      );
      if (!periodCheck.rows.length) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, message: 'Selected fee period does not belong to this student. Refresh and choose the correct month.' });
        return;
      }
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
              COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id OR (hp.period_id IS NULL AND hp.hostel_record_id=fp.hostel_record_id AND hp.payment_date BETWEEN fp.start_date AND fp.end_date)),0)::numeric AS paid_amount,
              GREATEST(COALESCE(fp.hostel_fee,0)+COALESCE(fp.mess_fee,0)-COALESCE(fp.discount,0)-COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id OR (hp.period_id IS NULL AND hp.hostel_record_id=fp.hostel_record_id AND hp.payment_date BETWEEN fp.start_date AND fp.end_date)),0),0)::numeric AS pending_balance,
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
         COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id OR (hp.period_id IS NULL AND hp.hostel_record_id=fp.hostel_record_id AND hp.payment_date BETWEEN fp.start_date AND fp.end_date)),0)::numeric AS paid_amount,
         GREATEST(hostel_fee+mess_fee-discount-COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id OR (hp.period_id IS NULL AND hp.hostel_record_id=fp.hostel_record_id AND hp.payment_date BETWEEN fp.start_date AND fp.end_date)),0),0)::numeric AS pending_balance`,
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

// PUT /api/hostel/:id — apply an individual student's monthly rate over a chosen date range.
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id, 10);
    const hf = Number(req.body?.hostel_fee);
    const mf = Number(req.body?.mess_fee);
    const from = dateValue(req.body?.period_from);
    const to = dateValue(req.body?.period_to);
    const notes = req.body?.notes ? String(req.body.notes) : null;

    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(hf) || hf < 0 || !Number.isFinite(mf) || mf < 0) {
      res.status(400).json({ success: false, message: 'Valid hostel and mess fees are required' });
      return;
    }
    if (!from || !to || from > to || from < '2025-01-01' || to > '2030-12-31') {
      res.status(400).json({ success: false, message: 'Choose a valid date range between January 2025 and December 2030' });
      return;
    }

    await client.query('BEGIN');
    const studentResult = await client.query(
      `SELECT hr.id AS hostel_record_id, hr.student_id, hr.notes,
              COALESCE(s.admission_date, s.created_at::date) AS joining_date,
              c.duration AS course_duration
       FROM hostel_records hr
       JOIN students s ON s.id=hr.student_id
       LEFT JOIN courses c ON c.id=s.course_id
       WHERE hr.id=$1 AND s.accommodation_type='hostel' AND s.status <> 'discontinued'
       FOR UPDATE OF hr`, [id]
    );
    if (!studentResult.rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Active hostel student not found' });
      return;
    }
    const student = studentResult.rows[0];
    const startDate = new Date(`${from}T00:00:00Z`);
    const endDate = new Date(`${to}T00:00:00Z`);
    const startIndex = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth();
    const rawEndIndex = endDate.getUTCFullYear() * 12 + endDate.getUTCMonth();
    // The end date is an exclusive anniversary for month counting: 14-Oct-2026
    // through 14-Oct-2027 represents 12 monthly charges (Oct through Sep), not 13.
    const endIndex = rawEndIndex - (endDate.getUTCDate() <= startDate.getUTCDate() ? 1 : 0);
    if (endIndex < startIndex) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, message: 'The selected date range must include at least one monthly fee period' });
      return;
    }
    const joiningDate = new Date(String(student.joining_date).slice(0, 10) + 'T00:00:00Z');
    const courseStartIndex = joiningDate.getUTCFullYear() * 12 + joiningDate.getUTCMonth();
    const duration = durationInMonths(student.course_duration);
    const courseEndIndex = courseStartIndex + duration - 1;
    if (startIndex < courseStartIndex || endIndex > courseEndIndex) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, message: `Selected range must be within the student's course period (${monthDateRange(Math.floor(courseStartIndex / 12), (courseStartIndex % 12) + 1).from} to ${monthDateRange(Math.floor(courseEndIndex / 12), (courseEndIndex % 12) + 1).to})` });
      return;
    }

    // A course fee schedule may be created only once for an overlapping range.
    // Changes to existing schedules must be made through the History > Edit Fee action.
    const scheduleConflict = await client.query(
      `SELECT id, TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date
       FROM hostel_fee_schedules
       WHERE hostel_record_id=$1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [id]
    );
    if (scheduleConflict.rows.length) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        code: 'FEE_SCHEDULE_EXISTS',
        message: 'A fee schedule already exists for this student and period. Use Edit Fees to change future monthly rates. To restart from zero, open Payment History and choose Delete All Fee & Payment History.',
      });
      return;
    }

    // Block creating over orphaned/legacy fee rows. They must be explicitly cleared from
    // the student's history first, otherwise old duplicate rows would be counted again.
    const stalePeriods = await client.query(
      `SELECT COUNT(*)::int AS count FROM hostel_fee_periods WHERE hostel_record_id=$1`,
      [id]
    );
    if (Number(stalePeriods.rows[0]?.count || 0) > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        code: 'LEGACY_FEE_DATA_EXISTS',
        message: 'Existing hostel fee data was found for this period. Open Payment History and choose Delete All Fee & Payment History before creating a fresh schedule.',
      });
      return;
    }

    // Existing paid months are immutable. During a first schedule creation or after a
    // schedule deletion, preserve those months and fill/update only unpaid months.
    const paidMonthsResult = await client.query(
      `SELECT fp.id, TO_CHAR(fp.start_date, 'YYYY-MM') AS fee_month,
              COALESCE(SUM(hp.amount),0)::numeric AS paid_amount
       FROM hostel_fee_periods fp
       LEFT JOIN hostel_payments hp ON (hp.period_id=fp.id OR (hp.period_id IS NULL AND hp.hostel_record_id=fp.hostel_record_id AND hp.payment_date BETWEEN fp.start_date AND fp.end_date))
       WHERE fp.hostel_record_id=$1
         AND fp.start_date >= $2::date AND fp.start_date <= $3::date
       GROUP BY fp.id, fp.start_date
       HAVING COALESCE(SUM(hp.amount),0) > 0
       ORDER BY fp.start_date`,
      [id, `${from.slice(0, 7)}-01`, monthDateRange(Math.floor(endIndex / 12), (endIndex % 12) + 1).from]
    );
    const paidPeriodIds = new Set(paidMonthsResult.rows.map((row: any) => Number(row.id)));

    let periodsUpdated = 0;
    for (let index = startIndex; index <= endIndex; index++) {
      const year = Math.floor(index / 12);
      const month = (index % 12) + 1;
      const range = monthDateRange(year, month);
      const existing = await client.query(
        `SELECT * FROM hostel_fee_periods
         WHERE hostel_record_id=$1
           AND ((start_date=$2::date AND end_date=$3::date) OR (period_from=$2::date AND period_to=$3::date))
         ORDER BY id DESC LIMIT 1 FOR UPDATE`, [id, range.from, range.to]
      );
      if (existing.rows.length) {
        const prior = existing.rows[0];
        if (paidPeriodIds.has(Number(prior.id))) {
          // Payments are historical facts: preserve the rate and payment allocation.
          continue;
        }
        const oldHostel = Number(prior.hostel_fee || 0);
        const oldMess = Number(prior.mess_fee || 0);
        // Replace the rate for this month; do not add to the existing charge.
        await client.query(
          `UPDATE hostel_fee_periods
           SET start_date=$3::date, end_date=$4::date, period_from=$3::date, period_to=$4::date,
               hostel_fee=$1, mess_fee=$2,
               discount=LEAST(COALESCE(discount,0), $1::numeric + $2::numeric),
               notes=COALESCE($5, notes), updated_at=NOW()
           WHERE id=$6`, [hf, mf, range.from, range.to, notes, prior.id]
        );
      } else {
        await client.query(
          `INSERT INTO hostel_fee_periods
             (hostel_record_id, student_id, period_from, period_to, start_date, end_date, hostel_fee, mess_fee, discount, notes)
           VALUES ($1,$2,$3::date,$4::date,$3::date,$4::date,$5,$6,0,$7)`,
          [id, student.student_id, range.from, range.to, hf, mf, notes || student.notes || null]
        );
      }
      periodsUpdated++;
    }

    await client.query(
      `INSERT INTO hostel_fee_revisions
         (hostel_record_id, student_id, effective_from, effective_to, previous_hostel_fee, previous_mess_fee, new_hostel_fee, new_mess_fee, changed_by, notes)
       VALUES ($1,$2,$3::date,$4::date,NULL,NULL,$5,$6,$7,$8)`,
      [id, student.student_id, `${from.slice(0, 7)}-01`, monthDateRange(Math.floor(endIndex / 12), (endIndex % 12) + 1).to, hf, mf, req.user!.id, notes]
    );

    await client.query(
      `INSERT INTO hostel_fee_schedules (hostel_record_id, start_date, end_date, created_by)
       VALUES ($1,$2::date,$3::date,$4)`,
      [id, `${from.slice(0, 7)}-01`, monthDateRange(Math.floor(endIndex / 12), (endIndex % 12) + 1).to, req.user!.id]
    );
    // Keep legacy values in sync for older screens; monthly periods remain the financial source of truth.
    await client.query(`UPDATE hostel_records SET hostel_fee=$1, mess_fee=$2, notes=COALESCE($3,notes) WHERE id=$4`, [hf, mf, notes, id]);
    await client.query('COMMIT');
    res.json({ success: true, data: { periods_updated: periodsUpdated, start_date: from, end_date: to, monthly_total: hf + mf, range_total: (hf + mf) * periodsUpdated } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('PUT /hostel/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});


// PUT /api/hostel/:id/revision — change rates from an effective month through the chosen end date.
router.put('/:id/revision', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id, 10);
    const hf = Number(req.body?.hostel_fee);
    const mf = Number(req.body?.mess_fee);
    const from = dateValue(req.body?.period_from);
    const to = dateValue(req.body?.period_to);
    const notes = req.body?.notes ? String(req.body.notes) : null;
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(hf) || hf < 0 || !Number.isFinite(mf) || mf < 0 || !from || !to || from > to || from < '2025-01-01' || to > '2030-12-31') {
      res.status(400).json({ success: false, message: 'Enter valid fees and an effective date range between January 2025 and December 2030.' });
      return;
    }
    await client.query('BEGIN');
    const studentResult = await client.query(
      `SELECT hr.id AS hostel_record_id, hr.student_id, hr.notes,
              COALESCE(s.admission_date, s.created_at::date) AS joining_date, c.duration AS course_duration
       FROM hostel_records hr JOIN students s ON s.id=hr.student_id
       LEFT JOIN courses c ON c.id=s.course_id
       WHERE hr.id=$1 AND s.accommodation_type='hostel' AND s.status <> 'discontinued'
       FOR UPDATE OF hr`, [id]
    );
    if (!studentResult.rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Active hostel student not found' });
      return;
    }
    const student = studentResult.rows[0];
    const scheduleResult = await client.query(
      `SELECT start_date, end_date FROM hostel_fee_schedules
       WHERE hostel_record_id=$1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [id]
    );
    if (!scheduleResult.rows.length) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'NO_ACTIVE_SCHEDULE', message: 'No active fee schedule exists. Create a new schedule first.' });
      return;
    }
    const fixedSchedule = scheduleResult.rows[0];
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);
    const startIndex = fromDate.getUTCFullYear() * 12 + fromDate.getUTCMonth();
    const rawEndIndex = toDate.getUTCFullYear() * 12 + toDate.getUTCMonth();
    const endIndex = rawEndIndex - (toDate.getUTCDate() <= fromDate.getUTCDate() ? 1 : 0);
    const scheduleStartDate = new Date(String(fixedSchedule.start_date).slice(0, 10) + 'T00:00:00Z');
    const scheduleEndDate = new Date(String(fixedSchedule.end_date).slice(0, 10) + 'T00:00:00Z');
    const scheduleStartIndex = scheduleStartDate.getUTCFullYear() * 12 + scheduleStartDate.getUTCMonth();
    const scheduleEndIndex = scheduleEndDate.getUTCFullYear() * 12 + scheduleEndDate.getUTCMonth();
    if (startIndex < scheduleStartIndex || endIndex !== scheduleEndIndex) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, code: 'FIXED_SCHEDULE_RANGE', message: 'The course end month is fixed. Select a fee increase month within the existing schedule; the end month cannot be changed.' });
      return;
    }
    const joining = new Date(String(student.joining_date).slice(0, 10) + 'T00:00:00Z');
    const courseStart = joining.getUTCFullYear() * 12 + joining.getUTCMonth();
    const courseEnd = courseStart + durationInMonths(student.course_duration) - 1;
    if (endIndex < startIndex || startIndex < courseStart || endIndex > courseEnd) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, message: 'The effective range must be inside the student course period and include at least one monthly fee period.' });
      return;
    }
    const firstEffectiveRange = monthDateRange(Math.floor(startIndex / 12), (startIndex % 12) + 1);
    const previousRateResult = await client.query(
      `SELECT hostel_fee, mess_fee FROM hostel_fee_periods
       WHERE hostel_record_id=$1 AND start_date=$2::date AND end_date=$3::date
       ORDER BY id DESC LIMIT 1`, [id, firstEffectiveRange.from, firstEffectiveRange.to]
    );
    const previousRate = previousRateResult.rows[0];
    if (!previousRate || Number(previousRate.hostel_fee || 0) !== hf || Number(previousRate.mess_fee || 0) !== mf) {
      await client.query(
        `INSERT INTO hostel_fee_revisions
           (hostel_record_id, student_id, effective_from, effective_to, previous_hostel_fee, previous_mess_fee, new_hostel_fee, new_mess_fee, changed_by, notes)
         VALUES ($1,$2,$3::date,$4::date,$5,$6,$7,$8,$9,$10)`,
        [id, student.student_id, firstEffectiveRange.from, monthDateRange(Math.floor(endIndex / 12), (endIndex % 12) + 1).to, previousRate?.hostel_fee ?? null, previousRate?.mess_fee ?? null, hf, mf, req.user!.id, notes]
      );
    }

    const periodsUpdated: string[] = [];
    for (let index = startIndex; index <= endIndex; index++) {
      const year = Math.floor(index / 12), month = (index % 12) + 1;
      const range = monthDateRange(year, month);
      const periodResult = await client.query(
        `SELECT fp.*, COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.period_id=fp.id OR (hp.period_id IS NULL AND hp.hostel_record_id=fp.hostel_record_id AND hp.payment_date BETWEEN fp.start_date AND fp.end_date)),0)::numeric AS paid_amount
         FROM hostel_fee_periods fp WHERE fp.hostel_record_id=$1
           AND fp.start_date=$2::date AND fp.end_date=$3::date
         ORDER BY fp.id DESC LIMIT 1 FOR UPDATE`, [id, range.from, range.to]
      );
      if (!periodResult.rows.length) {
        // Repair a missing monthly row inside an existing, fixed schedule.
        // This cannot extend the schedule because the end month is validated above.
        await client.query(
          `INSERT INTO hostel_fee_periods
             (hostel_record_id, student_id, period_from, period_to, start_date, end_date, hostel_fee, mess_fee, discount, notes)
           VALUES ($1,$2,$3::date,$4::date,$3::date,$4::date,$5,$6,0,$7)`,
          [id, student.student_id, range.from, range.to, hf, mf, notes || student.notes || null]
        );
        periodsUpdated.push(range.from.slice(0,7));
        continue;
      }
      const period = periodResult.rows[0];
      if (Number(period.paid_amount || 0) > 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ success: false, code: 'PAID_MONTHS_IN_RANGE', message: `The month ${range.from.slice(0,7)} already has a payment. Choose an effective date after the last paid month so previous fees and payments remain unchanged.` });
        return;
      }
      const oldHostel = Number(period.hostel_fee || 0), oldMess = Number(period.mess_fee || 0);
      if (oldHostel !== hf || oldMess !== mf) {
        await client.query(
          `UPDATE hostel_fee_periods SET hostel_fee=$1, mess_fee=$2,
             discount=LEAST(COALESCE(discount,0),$1::numeric+$2::numeric), notes=COALESCE($3,notes), updated_at=NOW()
           WHERE id=$4`, [hf, mf, notes, period.id]
        );
      }
      periodsUpdated.push(range.from.slice(0,7));
    }
    await client.query(`UPDATE hostel_records SET hostel_fee=$1,mess_fee=$2,notes=COALESCE($3,notes) WHERE id=$4`, [hf,mf,notes,id]);
    await client.query('COMMIT');
    res.json({ success: true, data: { periods_updated: periodsUpdated.length, months: periodsUpdated, start_date: from, end_date: to, monthly_total: hf + mf } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('PUT /hostel/:id/revision error:', err);
    res.status(500).json({ success: false, message: 'Failed to revise hostel fees' });
  } finally { client.release(); }
});

// DELETE /api/hostel/:id/history — explicitly clear all hostel fee data for one student.
// This removes hostel payment transactions as requested, but does not touch tuition/exam/uniform payments.
router.delete('/:id/history', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }
    await client.query('BEGIN');
    const record = await client.query('SELECT id FROM hostel_records WHERE id=$1 FOR UPDATE', [id]);
    if (!record.rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }
    const payments = await client.query('DELETE FROM hostel_payments WHERE hostel_record_id=$1 RETURNING id', [id]);
    const revisions = await client.query('DELETE FROM hostel_fee_revisions WHERE hostel_record_id=$1 RETURNING id', [id]);
    const periods = await client.query('DELETE FROM hostel_fee_periods WHERE hostel_record_id=$1 RETURNING id', [id]);
    const schedules = await client.query('DELETE FROM hostel_fee_schedules WHERE hostel_record_id=$1 RETURNING id', [id]);
    await client.query('UPDATE hostel_records SET hostel_fee=0, mess_fee=0 WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'All hostel fee schedules, monthly periods, revisions, and hostel payment transactions were permanently deleted for this student.',
      data: {
        payments_removed: payments.rowCount || 0,
        revisions_removed: revisions.rowCount || 0,
        periods_removed: periods.rowCount || 0,
        schedules_removed: schedules.rowCount || 0,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('DELETE /hostel/:id/history error:', err);
    res.status(500).json({ success: false, message: 'Failed to clear hostel fee history' });
  } finally {
    client.release();
  }
});

// DELETE /api/hostel/:id/schedule — remove the fee schedule but never delete recorded payments.
router.delete('/:id/schedule', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Invalid hostel record ID' });
      return;
    }
    await client.query('BEGIN');
    const record = await client.query('SELECT id FROM hostel_records WHERE id=$1 FOR UPDATE', [id]);
    if (!record.rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Hostel record not found' });
      return;
    }
    const deleted = await client.query(
      `WITH removed_schedules AS (
         UPDATE hostel_fee_schedules SET deleted_at=NOW()
         WHERE hostel_record_id=$1 AND deleted_at IS NULL
         RETURNING start_date, end_date
       )
       DELETE FROM hostel_fee_periods fp
       WHERE fp.hostel_record_id=$1
         AND (NOT EXISTS (SELECT 1 FROM removed_schedules)
              OR EXISTS (SELECT 1 FROM removed_schedules ds WHERE fp.start_date >= ds.start_date AND fp.end_date <= ds.end_date))
         AND NOT EXISTS (SELECT 1 FROM hostel_payments hp WHERE hp.period_id=fp.id)
         AND NOT EXISTS (SELECT 1 FROM hostel_payments hp WHERE hp.hostel_record_id=$1 AND hp.period_id IS NULL AND hp.payment_date BETWEEN fp.start_date AND fp.end_date)
       RETURNING fp.id`, [id]
    );
    const protectedResult = await client.query(
      `SELECT COUNT(DISTINCT fp.id)::int AS protected_months
       FROM hostel_fee_periods fp
       WHERE fp.hostel_record_id=$1 AND EXISTS (
         SELECT 1 FROM hostel_payments hp WHERE hp.hostel_record_id=$1
           AND (hp.period_id=fp.id OR (hp.period_id IS NULL AND hp.payment_date BETWEEN fp.start_date AND fp.end_date))
       )`, [id]
    );
    await client.query(`UPDATE hostel_records SET hostel_fee=0,mess_fee=0 WHERE id=$1`, [id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Fee schedule removed. Existing payment records and paid months were preserved.', data: { periods_removed: deleted.rows.length, protected_paid_months: Number(protectedResult.rows[0]?.protected_months || 0) } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('DELETE /hostel/:id/schedule error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete fee schedule' });
  } finally { client.release(); }
});

export default router;
