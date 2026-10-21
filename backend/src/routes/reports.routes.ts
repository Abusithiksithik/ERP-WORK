import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const reportMonthPeriod = (value: unknown): { from: string; to: string } => {
  const raw = String(value ?? '');
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      from: `${raw}-01`,
      to: `${raw}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  const now = new Date();
  const rawMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { from: `${rawMonth}-01`, to: `${rawMonth}-${String(lastDay).padStart(2, '0')}` };
};
router.use(authorize('super_admin', 'admin'));

const academicYearRange = (value: unknown): { from: string; to: string; startYear: number } => {
  // Reports use fixed two-year academic periods: 2025-2027 and 2026-2028.
  const parsed = Number(value);
  const startYear = parsed === 2025 || parsed === 2026 ? parsed : (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const safeStartYear = startYear === 2025 || startYear === 2026 ? startYear : 2026;
  return { from: `${safeStartYear}-04-01`, to: `${safeStartYear + 2}-03-31`, startYear: safeStartYear };
};


router.get('/course', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        s.student_id,
        s.full_name,
        s.mobile,
        c.course_name,
        b.batch_name,
        s.status
      FROM students s
      LEFT JOIN courses c ON c.id=s.course_id
      LEFT JOIN batches b ON b.id=s.batch_id
      WHERE s.status != 'discontinued'
        AND COALESCE(s.admission_date, s.created_at::date) BETWEEN $1::date AND $2::date
      ORDER BY s.created_at DESC
    `, [academicYearRange(req.query.year).from, academicYearRange(req.query.year).to]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /reports/course error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/enrollment', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        e.id AS enrollment_id,
        s.student_id AS student_code,
        s.full_name,
        s.mobile,
        s.email,
        cc.category_name AS master_course,
        c.course_name,
        b.batch_name,
        TO_CHAR(COALESCE(e.enrolled_at::date, s.admission_date), 'DD/MM/YYYY') AS enrollment_date,
        e.status,
        COALESCE(e.course_fee,0)::numeric AS course_fee,
        COALESCE(e.total_fee,0)::numeric AS total_fee,
        COALESCE(e.discount,0)::numeric AS discount,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.enrollment_id=e.id AND p.status='verified'),0)::numeric AS amount_paid,
        GREATEST(COALESCE(e.total_fee,0)-COALESCE(e.discount,0)-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.enrollment_id=e.id AND p.status='verified'),0),0)::numeric AS balance_due
      FROM enrollments e
      LEFT JOIN students s ON s.id=e.student_id
      LEFT JOIN courses c ON c.id=e.course_id
      LEFT JOIN course_categories cc ON cc.id=c.category_id
      LEFT JOIN batches b ON b.id=e.batch_id
      WHERE COALESCE(e.enrolled_at::date, s.admission_date, s.created_at::date) BETWEEN $1::date AND $2::date
      ORDER BY e.enrolled_at DESC, e.id DESC
    `, [academicYearRange(req.query.year).from, academicYearRange(req.query.year).to]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /reports/enrollment error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/hostel', async (req: AuthRequest, res: Response) => {
  try {
    // Keep reports consistent with Hostel Management by repairing missing
    // hostel_records for existing students marked as Hostel before querying.
    await query(`
      INSERT INTO hostel_records (student_id, hostel_fee, mess_fee, paid_amount)
      SELECT s.id, 0, 0, 0
      FROM students s
      WHERE LOWER(COALESCE(s.accommodation_type, '')) = 'hostel'
        AND LOWER(COALESCE(s.status, '')) <> 'discontinued'
        AND NOT EXISTS (SELECT 1 FROM hostel_records hr WHERE hr.student_id = s.id)
      ON CONFLICT (student_id) DO NOTHING
    `);

    const { from, to } = reportMonthPeriod(req.query.period_month);
    const academic = academicYearRange(req.query.year);
    if (from < academic.from || from > academic.to) {
      res.status(400).json({ success: false, message: 'Selected month must belong to the selected academic year' });
      return;
    }
    // Use the same month/schedule inclusion rules as Hostel Management. End dates
    // are exclusive for legacy schedules whose end_date is the first day of the
    // following month, so a January boundary must not make December's schedule
    // appear in January. A fee period for the selected month wins over legacy rows.
    const result = await query(`
      SELECT
        hr.id AS hostel_record_id,
        s.student_id AS student_code,
        s.full_name,
        c.course_name,
        b.batch_name,
        TO_CHAR(COALESCE(s.admission_date, s.created_at::date), 'DD/MM/YYYY') AS admission_date,
        TO_CHAR(COALESCE(fp.start_date, $1::date), 'DD/MM/YYYY') AS period_from,
        TO_CHAR(COALESCE(fp.end_date, $2::date), 'DD/MM/YYYY') AS period_to,
        COALESCE(fp.hostel_fee,0)::numeric AS hostel_fee,
        COALESCE(fp.mess_fee,0)::numeric AS mess_fee,
        (COALESCE(fp.hostel_fee,0)+COALESCE(fp.mess_fee,0))::numeric AS total_fee,
        COALESCE(fp.discount,0)::numeric AS discount,
        -- Match Hostel Management: cumulative payments through the selected month.
        -- Period-linked payments count only when their fee period is due by this month;
        -- legacy payments without a period_id are counted once by payment date.
        COALESCE((SELECT SUM(hp.amount)
          FROM hostel_payments hp
          WHERE hp.hostel_record_id=hr.id
            AND hp.payment_date <= $2::date
            AND (
              (hp.period_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM hostel_fee_periods fp_paid
                WHERE fp_paid.id=hp.period_id
                  AND fp_paid.hostel_record_id=hr.id
                  AND fp_paid.start_date <= $2::date
                  AND COALESCE(fp_paid.is_deleted,FALSE)=FALSE
              ))
              OR (hp.period_id IS NULL
                  AND hp.payment_date >= date_trunc('month', COALESCE(s.admission_date, s.created_at::date))::date
                  AND hp.payment_date <= $2::date
                  AND NOT EXISTS (SELECT 1 FROM hostel_fee_periods fp_deleted WHERE fp_deleted.hostel_record_id=hr.id AND fp_deleted.is_deleted=TRUE AND hp.payment_date BETWEEN fp_deleted.start_date AND fp_deleted.end_date))
            )),0)::numeric AS amount_paid,
        -- Report fee remains the selected month's charge; balance_due carries
        -- forward all unpaid scheduled fees through the selected month.
        GREATEST(
          COALESCE((SELECT SUM(GREATEST(COALESCE(fp_due.hostel_fee,0)+COALESCE(fp_due.mess_fee,0)-COALESCE(fp_due.discount,0),0))
            FROM hostel_fee_periods fp_due
            WHERE fp_due.hostel_record_id=hr.id
              AND fp_due.start_date >= date_trunc('month', COALESCE(s.admission_date, s.created_at::date))::date
              AND fp_due.start_date <= $2::date
              AND COALESCE(fp_due.is_deleted,FALSE)=FALSE),0)
          - COALESCE((SELECT SUM(hp_due.amount)
            FROM hostel_payments hp_due
            WHERE hp_due.hostel_record_id=hr.id
              AND hp_due.payment_date <= $2::date AND (
              (hp_due.period_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM hostel_fee_periods fp_paid
                WHERE fp_paid.id=hp_due.period_id AND fp_paid.hostel_record_id=hr.id
                  AND fp_paid.start_date >= date_trunc('month', COALESCE(s.admission_date, s.created_at::date))::date
                  AND fp_paid.start_date <= $2::date
                  AND COALESCE(fp_paid.is_deleted,FALSE)=FALSE
              ))
              OR (hp_due.period_id IS NULL
                  AND hp_due.payment_date >= date_trunc('month', COALESCE(s.admission_date, s.created_at::date))::date
                  AND hp_due.payment_date <= $2::date
                  AND NOT EXISTS (SELECT 1 FROM hostel_fee_periods fp_deleted WHERE fp_deleted.hostel_record_id=hr.id AND fp_deleted.is_deleted=TRUE AND hp_due.payment_date BETWEEN fp_deleted.start_date AND fp_deleted.end_date))
            )),0),
          0
        )::numeric AS balance_due
      FROM hostel_records hr
      JOIN students s ON s.id=hr.student_id
      LEFT JOIN courses c ON c.id=s.course_id
      LEFT JOIN batches b ON b.id=s.batch_id
      LEFT JOIN LATERAL (
        SELECT hfp.* FROM hostel_fee_periods hfp
        WHERE hfp.hostel_record_id=hr.id
          AND COALESCE(hfp.is_deleted,FALSE)=FALSE
          AND hfp.start_date <= $2::date
          AND hfp.end_date > $1::date
        ORDER BY (date_trunc('month', hfp.start_date) = date_trunc('month', $1::date)) DESC,
                 hfp.start_date DESC, hfp.id DESC
        LIMIT 1
      ) fp ON TRUE
      WHERE LOWER(COALESCE(s.accommodation_type,''))='hostel'
        AND LOWER(COALESCE(s.status,'')) <> 'discontinued'
        AND (
          EXISTS (
            SELECT 1 FROM hostel_fee_schedules fs
            WHERE fs.hostel_record_id=hr.id AND fs.deleted_at IS NULL
              AND fs.start_date <= $2::date AND fs.end_date > $1::date
          )
          OR EXISTS (
            SELECT 1 FROM hostel_fee_periods hfp_month
            WHERE hfp_month.hostel_record_id=hr.id
              AND COALESCE(hfp_month.is_deleted,FALSE)=FALSE
              AND hfp_month.start_date <= $2::date AND hfp_month.end_date > $1::date
          )
          OR (
            -- Keep an unscheduled hostel student visible only in their
            -- admission month; subsequent months require an explicit schedule.
            NOT EXISTS (
              SELECT 1 FROM hostel_fee_schedules fs_unscheduled
              WHERE fs_unscheduled.hostel_record_id=hr.id AND fs_unscheduled.deleted_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM hostel_fee_periods fp_unscheduled
              WHERE fp_unscheduled.hostel_record_id=hr.id
            )
            AND date_trunc('month', COALESCE(s.admission_date, s.created_at::date))
                = date_trunc('month', $1::date)
          )
        )
      ORDER BY s.full_name ASC
    `, [from, to]);
    res.json({ success: true, data: result.rows, period: { period_from: from, period_to: to } });
  } catch (err) {
    console.error('GET /reports/hostel error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/exam-fee', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        s.student_id AS student_code,
        s.full_name,
        c.course_name,
        b.batch_name,
        COALESCE(efr.exam_fee,0)::numeric AS exam_fee,
        COALESCE(efr.discount,0)::numeric AS discount,
        COALESCE(efr.paid_amount,0)::numeric AS amount_paid,
        GREATEST(COALESCE(efr.exam_fee,0)-COALESCE(efr.discount,0)-COALESCE(efr.paid_amount,0),0)::numeric AS balance_due
      FROM exam_fee_records efr
      JOIN students s ON s.id=efr.student_id
      LEFT JOIN courses c ON c.id=s.course_id
      LEFT JOIN batches b ON b.id=s.batch_id
      WHERE s.status != 'discontinued'
        AND COALESCE(s.admission_date, s.created_at::date) BETWEEN $1::date AND $2::date
      ORDER BY s.full_name ASC
    `, [academicYearRange(req.query.year).from, academicYearRange(req.query.year).to]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /reports/exam-fee error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/uniform', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        s.id AS student_id,
        s.student_id AS student_code,
        s.full_name,
        c.course_name,
        b.batch_name,
        COALESCE(su.status, CASE WHEN s.uniform_received THEN 'received' ELSE 'not_received' END) AS uniform_status,
        su.uniform_year,
        COALESCE(su.set_count, 0)::integer AS set_count,
        CASE su.uniform_year WHEN '1st Year' THEN 1400 WHEN '2nd Year' THEN 1000 ELSE 0 END::numeric AS price_per_set,
        (COALESCE(su.set_count, 0) * CASE su.uniform_year WHEN '1st Year' THEN 1400 WHEN '2nd Year' THEN 1000 ELSE 0 END)::numeric AS total_amount,
        COALESCE((SELECT p.amount FROM payments p
          WHERE p.student_id=s.id AND p.payment_type='uniform' AND p.status='verified'
          ORDER BY p.created_at DESC, p.id DESC LIMIT 1),0)::numeric AS amount_paid,
        GREATEST((COALESCE(su.set_count, 0) * CASE su.uniform_year WHEN '1st Year' THEN 1400 WHEN '2nd Year' THEN 1000 ELSE 0 END) - COALESCE((SELECT p.amount FROM payments p
          WHERE p.student_id=s.id AND p.payment_type='uniform' AND p.status='verified'
          ORDER BY p.created_at DESC, p.id DESC LIMIT 1),0),0)::numeric AS balance_due
      FROM students s
      LEFT JOIN student_uniform su ON su.student_id=s.id
      LEFT JOIN courses c ON c.id=s.course_id
      LEFT JOIN batches b ON b.id=s.batch_id
      WHERE s.status != 'discontinued'
        AND COALESCE(s.admission_date, s.created_at::date) BETWEEN $1::date AND $2::date
        AND (su.status = 'received' OR s.uniform_received = true OR EXISTS (
          SELECT 1 FROM payments p WHERE p.student_id=s.id AND p.payment_type='uniform' AND p.status='verified'
        ))
      ORDER BY s.full_name ASC
    `, [academicYearRange(req.query.year).from, academicYearRange(req.query.year).to]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /reports/uniform error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
