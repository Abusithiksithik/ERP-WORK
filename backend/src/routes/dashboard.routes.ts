import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, authorize('super_admin', 'admin', 'incharge', 'teacher'));

// GET /api/dashboard/stats
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [candidates, courses, faculty, activeCandidates, pendingPayments, activeEnrollments] = await Promise.all([
      query("SELECT COUNT(*) FROM students WHERE status='active'"),
      query("SELECT COUNT(*) FROM courses WHERE status='active'"),
      query("SELECT COUNT(*) FROM users WHERE role IN ('incharge','teacher')"),
      query("SELECT COUNT(*) FROM students WHERE status='active'"),
      query("SELECT COUNT(*) FROM payments WHERE status='pending'"),
      query("SELECT COUNT(*) FROM enrollments WHERE status='approved'"),
    ]);
    res.json({
      success: true,
      data: {
        totalCandidates:   parseInt(candidates.rows[0].count),
        totalCourses:      parseInt(courses.rows[0].count),
        totalFaculty:      parseInt(faculty.rows[0].count),
        activeCandidates:  parseInt(activeCandidates.rows[0].count),
        pendingPayments:   parseInt(pendingPayments.rows[0].count),
        activeEnrollments: parseInt(activeEnrollments.rows[0].count),
      }
    });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/recent-students
router.get('/recent-students', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT s.student_id, s.full_name, c.course_name, s.status, s.admission_date
      FROM students s
      LEFT JOIN courses c ON c.id = s.course_id
      WHERE s.status = 'active'
      ORDER BY s.created_at DESC
      LIMIT 5
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/charts/revenue — last 12 months verified payments
router.get('/charts/revenue', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT TO_CHAR(payment_date, 'Mon YYYY') as month,
             DATE_TRUNC('month', payment_date) as month_date,
             COALESCE(SUM(amount),0) as revenue
      FROM payments WHERE status='verified'
        AND payment_date >= NOW() - INTERVAL '12 months'
      GROUP BY month, month_date ORDER BY month_date ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/charts/enrollments
router.get('/charts/enrollments', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT TO_CHAR(enrolled_at, 'Mon YYYY') as month,
             DATE_TRUNC('month', enrolled_at) as month_date,
             COUNT(*) as enrollments
      FROM enrollments
      WHERE enrolled_at >= NOW() - INTERVAL '12 months'
        AND status = 'approved'
      GROUP BY month, month_date ORDER BY month_date ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/charts/students
router.get('/charts/students', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT TO_CHAR(created_at, 'Mon YYYY') as month,
             DATE_TRUNC('month', created_at) as month_date,
             COUNT(*) as students
      FROM students
      WHERE created_at >= NOW() - INTERVAL '12 months'
        AND status = 'active'
      GROUP BY month, month_date ORDER BY month_date ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/dashboard/charts/course-finance — course-wise paid + pending (exam fees)
router.get('/charts/course-finance', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(cc.category_name, 'No Category') AS category_name,
        c.course_name,
        COALESCE(cc.category_name, '') || ' → ' || c.course_name AS label,
        COUNT(DISTINCT efr.student_id)                              AS candidate_count,
        COALESCE(SUM(efr.exam_fee), 0)::numeric    AS total_fee,
        COALESCE(SUM(efr.paid_amount), 0)::numeric                  AS paid_amount,
        GREATEST(
          COALESCE(SUM(efr.exam_fee), 0)
          - COALESCE(SUM(efr.paid_amount), 0),
          0
        )::numeric                                                   AS pending_amount
      FROM exam_fee_records efr
      JOIN students s ON s.id = efr.student_id AND s.status = 'active'
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
      LEFT JOIN courses c ON c.id = s.course_id
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      GROUP BY cc.category_name, c.course_name
      HAVING COUNT(DISTINCT efr.student_id) > 0
      ORDER BY cc.category_name, c.course_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /dashboard/charts/course-finance error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/dashboard/charts/exam-fee-summary — overall exam fee summary
router.get('/charts/exam-fee-summary', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(SUM(efr.exam_fee), 0)::numeric AS total_fee,
        COALESCE(SUM(efr.paid_amount), 0)::numeric               AS paid_amount,
        GREATEST(
          COALESCE(SUM(efr.exam_fee), 0)
          - COALESCE(SUM(efr.paid_amount), 0),
          0
        )::numeric                                                AS pending_amount
      FROM exam_fee_records efr
      JOIN students s ON s.id = efr.student_id AND s.status = 'active'
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /dashboard/charts/exam-fee-summary error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// GET /api/dashboard/academy — live academy dashboard data (no demo/sample values).
router.get('/academy', async (req: AuthRequest, res: Response) => {
  try {
    const courseFilter = String(req.query.course || 'All');
    const yearFilter = String(req.query.year || 'All');
    const period = ['day', 'week', 'month'].includes(String(req.query.period)) ? String(req.query.period) : 'day';
    const filters: unknown[] = [];
    let filterSql = '';
    if (courseFilter !== 'All') { filters.push(courseFilter); filterSql += ` AND c.course_name = $${filters.length}`; }
    if (yearFilter !== 'All') {
      filters.push(yearFilter === '1st Year' ? '2026' : '2025');
      filterSql += ` AND LEFT(b.batch_name,4) = $${filters.length}`;
    }

    const cohorts = await query(`
      SELECT c.id AS course_id, c.course_name, cc.category_name, b.id AS batch_id,
             b.batch_name, b.start_date, b.end_date,
             COALESCE(dbs.approved_seats,0)::int AS approved_seats,
             COUNT(DISTINCT s.id)::int AS joined,
             COUNT(DISTINCT CASE WHEN a.attendance_date=CURRENT_DATE AND a.status='present' THEN s.id END)::int AS present_today
      FROM batches b
      JOIN courses c ON c.id=b.course_id
      LEFT JOIN course_categories cc ON cc.id=c.category_id
      LEFT JOIN dashboard_batch_seats dbs ON dbs.batch_id=b.id
      LEFT JOIN students s ON s.batch_id=b.id AND s.status='active'
        AND EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.batch_id=b.id AND e.status='approved')
      LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=CURRENT_DATE
      WHERE b.batch_name IN ('2025-2027','2026-2028') ${filterSql}
      GROUP BY c.id,c.course_name,cc.category_name,b.id,b.batch_name,b.start_date,b.end_date,dbs.approved_seats
      ORDER BY c.course_name, b.batch_name
    `, filters);

    const studentFilterParams: unknown[] = [];
    let studentFilterSql = ` WHERE s.status='active' AND EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.batch_id=s.batch_id AND e.status='approved')`;
    if (courseFilter !== 'All') { studentFilterParams.push(courseFilter); studentFilterSql += ` AND c.course_name=$${studentFilterParams.length}`; }
    if (yearFilter !== 'All') { studentFilterParams.push(yearFilter === '1st Year' ? '2026' : '2025'); studentFilterSql += ` AND LEFT(b.batch_name,4)=$${studentFilterParams.length}`; }

    const fees = await query(`
      WITH cohort_students AS (
        SELECT s.id, s.batch_id, c.course_name, b.batch_name
        FROM students s JOIN courses c ON c.id=s.course_id JOIN batches b ON b.id=s.batch_id
        ${studentFilterSql}
      ), fee_rows AS (
        SELECT 'Tuition Fee'::text AS fee_type,
          COALESCE(SUM(GREATEST(COALESCE(e.total_fee,0)-COALESCE(e.discount,0),0)),0)::numeric AS due,
          COALESCE(SUM((SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.enrollment_id=e.id AND p.status='verified')),0)::numeric AS paid,
          COUNT(DISTINCT cs.id)::int AS strength
        FROM cohort_students cs JOIN enrollments e ON e.student_id=cs.id AND e.batch_id=cs.batch_id AND e.status='approved'
        UNION ALL
        SELECT 'Uniform Fee',
          COALESCE(SUM(COALESCE(su.set_count,0) * CASE su.uniform_year WHEN '1st Year' THEN 1400 WHEN '2nd Year' THEN 1000 ELSE 0 END),0)::numeric,
          COALESCE(SUM((SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.student_id=cs.id AND p.payment_type='uniform' AND p.status='verified')),0)::numeric,
          COUNT(DISTINCT cs.id)::int
        FROM cohort_students cs JOIN student_uniform su ON su.student_id=cs.id
        UNION ALL
        SELECT 'Exam Fee',
          COALESCE(SUM(GREATEST(COALESCE(efr.exam_fee,0)+COALESCE(efr.other_fee,0)-COALESCE(efr.discount,0),0)),0)::numeric,
          COALESCE(SUM(COALESCE(efr.paid_amount,0)),0)::numeric,
          COUNT(DISTINCT cs.id)::int
        FROM cohort_students cs JOIN exam_fee_records efr ON efr.student_id=cs.id
        UNION ALL
        SELECT 'Hostel & Mess Fee',
          COALESCE(SUM(h.due),0)::numeric, COALESCE(SUM(h.paid),0)::numeric, COUNT(DISTINCT h.student_id)::int
        FROM (
          SELECT cs.id AS student_id,
            CASE WHEN EXISTS (SELECT 1 FROM hostel_fee_periods fp WHERE fp.hostel_record_id=hr.id)
              THEN COALESCE((SELECT SUM(GREATEST(fp.hostel_fee+fp.mess_fee-fp.discount,0)) FROM hostel_fee_periods fp WHERE fp.hostel_record_id=hr.id AND fp.is_deleted=FALSE AND fp.start_date<=CURRENT_DATE),0)
              ELSE COALESCE(hr.hostel_fee+hr.mess_fee,0) END AS due,
            CASE WHEN EXISTS (SELECT 1 FROM hostel_fee_periods fp WHERE fp.hostel_record_id=hr.id)
              THEN COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.hostel_record_id=hr.id AND hp.payment_date<=CURRENT_DATE AND (hp.period_id IS NULL OR EXISTS (SELECT 1 FROM hostel_fee_periods fp2 WHERE fp2.id=hp.period_id AND fp2.is_deleted=FALSE))),0)
              ELSE COALESCE(hr.paid_amount,0) END AS paid
          FROM cohort_students cs JOIN hostel_records hr ON hr.student_id=cs.id
          WHERE EXISTS (SELECT 1 FROM hostel_fee_schedules fs WHERE fs.hostel_record_id=hr.id AND fs.deleted_at IS NULL)
             OR EXISTS (SELECT 1 FROM hostel_fee_periods fp WHERE fp.hostel_record_id=hr.id)
             OR (NOT EXISTS (SELECT 1 FROM hostel_fee_schedules fs WHERE fs.hostel_record_id=hr.id) AND NOT EXISTS (SELECT 1 FROM hostel_fee_periods fp WHERE fp.hostel_record_id=hr.id))
        ) h
      ) SELECT fee_type, due, paid, GREATEST(due-paid,0)::numeric AS balance, strength FROM fee_rows
    `, studentFilterParams);


    const feeCohorts = await query(`
      WITH cohort_students AS (
        SELECT s.id, s.batch_id, c.course_name, b.batch_name
        FROM students s JOIN courses c ON c.id=s.course_id JOIN batches b ON b.id=s.batch_id
        ${studentFilterSql}
      ), fee_parts AS (
        SELECT cs.batch_id,'Tuition Fee'::text AS fee_type,
          GREATEST(COALESCE(e.total_fee,0)-COALESCE(e.discount,0),0)::numeric AS due,
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.enrollment_id=e.id AND p.status='verified'),0)::numeric AS paid
        FROM cohort_students cs JOIN enrollments e ON e.student_id=cs.id AND e.batch_id=cs.batch_id AND e.status='approved'
        UNION ALL
        SELECT cs.batch_id,'Uniform Fee',
          (COALESCE(su.set_count,0)*CASE su.uniform_year WHEN '1st Year' THEN 1400 WHEN '2nd Year' THEN 1000 ELSE 0 END)::numeric,
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id=cs.id AND p.payment_type='uniform' AND p.status='verified'),0)::numeric
        FROM cohort_students cs JOIN student_uniform su ON su.student_id=cs.id
        UNION ALL
        SELECT cs.batch_id,'Exam Fee',
          GREATEST(COALESCE(efr.exam_fee,0)+COALESCE(efr.other_fee,0)-COALESCE(efr.discount,0),0)::numeric,
          COALESCE(efr.paid_amount,0)::numeric
        FROM cohort_students cs JOIN exam_fee_records efr ON efr.student_id=cs.id
        UNION ALL
        SELECT cs.batch_id,'Hostel & Mess Fee',h.due::numeric,h.paid::numeric
        FROM cohort_students cs JOIN hostel_records hr ON hr.student_id=cs.id
        CROSS JOIN LATERAL (
          SELECT
            CASE WHEN EXISTS (SELECT 1 FROM hostel_fee_periods fp WHERE fp.hostel_record_id=hr.id)
              THEN COALESCE((SELECT SUM(GREATEST(fp.hostel_fee+fp.mess_fee-fp.discount,0)) FROM hostel_fee_periods fp WHERE fp.hostel_record_id=hr.id AND fp.is_deleted=FALSE AND fp.start_date<=CURRENT_DATE),0)
              ELSE COALESCE(hr.hostel_fee+hr.mess_fee,0) END AS due,
            CASE WHEN EXISTS (SELECT 1 FROM hostel_fee_periods fp WHERE fp.hostel_record_id=hr.id)
              THEN COALESCE((SELECT SUM(hp.amount) FROM hostel_payments hp WHERE hp.hostel_record_id=hr.id AND hp.payment_date<=CURRENT_DATE AND (hp.period_id IS NULL OR EXISTS (SELECT 1 FROM hostel_fee_periods fp2 WHERE fp2.id=hp.period_id AND fp2.is_deleted=FALSE))),0)
              ELSE COALESCE(hr.paid_amount,0) END AS paid
        ) h
      ), per_batch AS (
        SELECT batch_id, SUM(due)::numeric AS due, SUM(paid)::numeric AS paid
        FROM fee_parts GROUP BY batch_id
      )
      SELECT b.id AS batch_id,c.course_name,b.batch_name,
        COUNT(DISTINCT cs.id)::int AS strength,
        COALESCE(pb.due,0)::numeric AS due,COALESCE(pb.paid,0)::numeric AS paid,
        GREATEST(COALESCE(pb.due,0)-COALESCE(pb.paid,0),0)::numeric AS balance,
        CASE WHEN COALESCE(pb.due,0)>0 THEN ROUND(COALESCE(pb.paid,0)/pb.due*100,1) ELSE 0 END AS collected_pct
      FROM cohort_students cs JOIN batches b ON b.id=cs.batch_id JOIN courses c ON c.id=b.course_id
      LEFT JOIN per_batch pb ON pb.batch_id=b.id
      GROUP BY b.id,c.course_name,b.batch_name,pb.due,pb.paid
      ORDER BY c.course_name,b.batch_name
    `, studentFilterParams);

    const attendance = await query(`
      WITH cohort_students AS (
        SELECT s.id, s.batch_id, c.course_name, b.batch_name
        FROM students s JOIN courses c ON c.id=s.course_id JOIN batches b ON b.id=s.batch_id
        ${studentFilterSql}
      ), bounds AS (
        SELECT CASE WHEN $${studentFilterParams.length + 1}='day' THEN CURRENT_DATE
                    WHEN $${studentFilterParams.length + 1}='week' THEN date_trunc('week',CURRENT_DATE)::date
                    ELSE date_trunc('month',CURRENT_DATE)::date END AS period_start,
          (SELECT COUNT(*)::int FROM generate_series(
            CASE WHEN $${studentFilterParams.length + 1}='day' THEN CURRENT_DATE
                 WHEN $${studentFilterParams.length + 1}='week' THEN date_trunc('week',CURRENT_DATE)::date
                 ELSE date_trunc('month',CURRENT_DATE)::date END, CURRENT_DATE, INTERVAL '1 day'
          ) gd WHERE EXTRACT(DOW FROM gd)<>0) AS working_days
      ), student_att AS (
        SELECT cs.id, COUNT(a.id)::int AS total,
               COUNT(a.id) FILTER (WHERE a.status='present')::int AS present
        FROM cohort_students cs LEFT JOIN attendance a ON a.student_id=cs.id
          AND a.attendance_date BETWEEN (SELECT period_start FROM bounds) AND CURRENT_DATE
        GROUP BY cs.id
      ), cohort_att AS (
        SELECT c.course_name,b.batch_name,COUNT(DISTINCT cs.id)::int AS students,
          COALESCE(SUM(sa.present),0)::int AS present,
          COALESCE(SUM(sa.total),0)::int AS marked,
          COUNT(*) FILTER (WHERE sa.present::numeric/NULLIF((SELECT working_days FROM bounds),0) < 0.75)::int AS below_75
        FROM cohort_students cs JOIN student_att sa ON sa.id=cs.id
        JOIN batches b ON b.id=cs.batch_id JOIN courses c ON c.id=b.course_id
        GROUP BY c.course_name,b.batch_name ORDER BY c.course_name,b.batch_name
      ), trend_dates AS (
        SELECT day FROM (
          SELECT d::date AS day FROM generate_series(CURRENT_DATE-INTERVAL '30 days',CURRENT_DATE,INTERVAL '1 day') d
          WHERE EXTRACT(DOW FROM d)<>0 ORDER BY d DESC LIMIT 14
        ) recent_days ORDER BY day ASC
      ), trend AS (
        SELECT td.day, COUNT(a.id)::int AS marked,
          COUNT(a.id) FILTER (WHERE a.status='present')::int AS present,
          COUNT(DISTINCT cs.id)::int AS students
        FROM trend_dates td CROSS JOIN cohort_students cs
        LEFT JOIN attendance a ON a.student_id=cs.id AND a.attendance_date=td.day
        GROUP BY td.day ORDER BY td.day
      )
      SELECT json_build_object(
        'cohorts',(SELECT COALESCE(json_agg(cohort_att),'[]'::json) FROM cohort_att),
        'trend',(SELECT COALESCE(json_agg(json_build_object('date',day,'present',present,'marked',marked,'percentage',CASE WHEN students>0 THEN ROUND(present::numeric/students*100,1) ELSE NULL END)),'[]'::json) FROM trend),
        'overall',(SELECT json_build_object('students',COUNT(*),'present',COALESCE(SUM(present),0),'marked',COALESCE(SUM(total),0),'working_days',(SELECT working_days FROM bounds),'below_75',COUNT(*) FILTER (WHERE present::numeric/NULLIF((SELECT working_days FROM bounds),0)<0.75)) FROM student_att)
      ) AS data
    `, [...studentFilterParams, period]);

    const rows = cohorts.rows.map((r: any) => ({
      ...r, joined: Number(r.joined || 0), approved_seats: Number(r.approved_seats || 0),
      vacant: Math.max(Number(r.approved_seats || 0)-Number(r.joined || 0),0),
      filled_pct: Number(r.approved_seats || 0) ? Math.round(Number(r.joined || 0)/Number(r.approved_seats)*1000)/10 : 0,
      year: String(r.batch_name).startsWith('2026') ? '1st Year' : '2nd Year'
    }));
    const totalSeats = rows.reduce((n: number,r: any)=>n+r.approved_seats,0);
    const totalJoined = rows.reduce((n: number,r: any)=>n+r.joined,0);
    const feeRows = fees.rows.map((r: any)=>({...r,due:Number(r.due||0),paid:Number(r.paid||0),balance:Number(r.balance||0),strength:Number(r.strength||0)}));
    const feeTotal = feeRows.reduce((a: any,r: any)=>({due:a.due+r.due,paid:a.paid+r.paid,balance:a.balance+r.balance}),{due:0,paid:0,balance:0});
    res.json({success:true,data:{cohorts:rows,seatTotals:{approved:totalSeats,joined:totalJoined,vacant:Math.max(totalSeats-totalJoined,0),filledPct:totalSeats?Math.round(totalJoined/totalSeats*1000)/10:0},fees:feeRows,feeTotal,feeCohorts:feeCohorts.rows.map((r:any)=>({...r,strength:Number(r.strength||0),due:Number(r.due||0),paid:Number(r.paid||0),balance:Number(r.balance||0),collected_pct:Number(r.collected_pct||0)})),attendance:attendance.rows[0]?.data||{cohorts:[],trend:[],overall:{students:0,present:0,marked:0,working_days:0,below_75:0}}}});
  } catch (err) {
    console.error('GET /dashboard/academy error:', err);
    res.status(500).json({success:false,message:'Unable to load academy dashboard data'});
  }
});

// Persist government-approved seat allocation for a batch.
router.put('/academy/seats/:batchId', authorize('super_admin','admin','incharge'), async (req: AuthRequest, res: Response) => {
  try {
    const seats = Number(req.body?.approved_seats);
    if (!Number.isInteger(seats) || seats < 0) {
      res.status(400).json({success:false,message:'Approved seats must be a non-negative whole number'});
      return;
    }
    const result = await query(`
      INSERT INTO dashboard_batch_seats(batch_id,approved_seats,updated_by,updated_at)
      SELECT id,$1,$2,NOW() FROM batches WHERE id=$3
      ON CONFLICT(batch_id) DO UPDATE SET approved_seats=EXCLUDED.approved_seats,updated_by=EXCLUDED.updated_by,updated_at=NOW()
      RETURNING batch_id,approved_seats
    `,[seats,req.user!.id,req.params.batchId]);
    if (!result.rows.length) { res.status(404).json({success:false,message:'Batch not found'}); return; }
    res.json({success:true,data:result.rows[0]});
  } catch (err) {
    console.error('PUT /dashboard/academy/seats error:',err);
    res.status(500).json({success:false,message:'Unable to save approved seats'});
  }
});

export default router;
