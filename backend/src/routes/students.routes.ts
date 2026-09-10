import { Router, Response } from 'express';
import { pool, query } from '../config/db';
import { generateStudentId } from '../utils/studentId';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { uploadPhoto, uploadCertificate, uploadConsentImage, uploadConsentPdf, uploadConsentVideo } from '../middleware/upload';
import { stringify } from 'csv-stringify/sync';

const router = Router();
router.use(authenticate);

// ── Validation helpers ──────────────────────────────────────────
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const EMAIL_REGEX  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStudentInput(body: any): string | null {
  const { full_name, mobile, email } = body;
  if (!full_name || String(full_name).trim().length < 3)
    return 'Student name must be at least 3 characters';
  if (String(full_name).trim().length > 150)
    return 'Student name must be under 150 characters';
  if (!mobile) return 'Mobile number is required';
  if (!MOBILE_REGEX.test(String(mobile).trim()))
    return 'Invalid Mobile Number — must be 10 digits starting with 6, 7, 8, or 9';
  // email is optional — only validate format if provided
  if (email && String(email).trim() !== '' && !EMAIL_REGEX.test(String(email).trim().toLowerCase()))
    return 'Invalid Email Address';
  return null;
}

// ── GET /api/students ──────────────────────────────────────────
router.get('/', authorize('super_admin', 'admin', 'incharge', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const { search, course_id, batch_id, status, page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    let q = `SELECT s.*, c.course_name, b.batch_name
             FROM students s
             LEFT JOIN courses c ON c.id = s.course_id
             LEFT JOIN batches b ON b.id = s.batch_id
             WHERE 1=1`;
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (s.full_name ILIKE $${params.length} OR s.email ILIKE $${params.length} OR s.student_id ILIKE $${params.length} OR s.mobile ILIKE $${params.length})`;
    }
    if (course_id) { params.push(course_id); q += ` AND s.course_id=$${params.length}`; }
    if (batch_id)  { params.push(batch_id);  q += ` AND s.batch_id=$${params.length}`;  }
    if (status)    { params.push(status);    q += ` AND s.status=$${params.length}`;    }
    else           { q += " AND s.status != 'discontinued'"; }

    const countResult = await query(`SELECT COUNT(*) FROM (${q}) AS t`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit as string)); q += ` ORDER BY s.created_at DESC LIMIT $${params.length}`;
    params.push(offset); q += ` OFFSET $${params.length}`;

    const result = await query(q, params);
    res.json({ success: true, data: result.rows, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/students/export ──────────────────────────────────────────
router.get('/export', authorize('super_admin', 'admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT s.student_id, s.full_name, s.mobile, s.email, s.date_of_birth, s.gender,
              s.address, s.parent_name, s.parent_mobile, s.guardian_type, s.parent_present,
              c.course_name, b.batch_name, s.admission_date, s.status
       FROM students s
       LEFT JOIN courses c ON c.id = s.course_id
       LEFT JOIN batches b ON b.id = s.batch_id
       WHERE s.status != 'discontinued'
       ORDER BY s.created_at DESC`
    );
    const csv = stringify(result.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/students/discontinued ──────────────────────────────────────
router.get('/discontinued', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { search, page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    let q = `SELECT s.*, c.course_name, b.batch_name
             FROM students s
             LEFT JOIN courses c ON c.id = s.course_id
             LEFT JOIN batches b ON b.id = s.batch_id
             WHERE s.status = 'discontinued'`;
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (s.full_name ILIKE $${params.length} OR s.email ILIKE $${params.length} OR s.student_id ILIKE $${params.length} OR s.mobile ILIKE $${params.length})`;
    }
    const countResult = await query(`SELECT COUNT(*) FROM (${q}) AS t`, params);
    const total = parseInt(countResult.rows[0].count);
    params.push(parseInt(limit as string)); q += ` ORDER BY s.discontinued_at DESC LIMIT $${params.length}`;
    params.push(offset); q += ` OFFSET $${params.length}`;
    const result = await query(q, params);
    res.json({ success: true, data: result.rows, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/students/:id/discontinue-details ───────────────────────────
router.get('/:id/discontinue-details', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const studentRes = await query(
      `SELECT s.*, c.course_name, c.fee_amount, b.batch_name
       FROM students s
       LEFT JOIN courses c ON c.id = s.course_id
       LEFT JOIN batches b ON b.id = s.batch_id
       WHERE s.id=$1`, [id]
    );
    if (studentRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    const student = studentRes.rows[0];

    // Course/enrollment fee data.  The enrollment's saved discount is part of
    // the final fee calculation, so discontinuation uses the same numbers the
    // Enrollment Management screen shows.
    const enrollmentsRes = await query(
      `SELECT e.*, c.course_name,
              COALESCE(e.total_fee, 0)::numeric AS calculated_total_fee,
              COALESCE(e.discount, 0)::numeric AS calculated_discount
       FROM enrollments e
       LEFT JOIN courses c ON c.id = e.course_id
       WHERE e.student_id=$1
       ORDER BY e.enrolled_at DESC`, [id]
    );

    const paymentsRes = await query(
      `SELECT p.*, pm.method_type
       FROM payments p
       LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
       WHERE p.student_id=$1
       ORDER BY p.payment_date DESC`, [id]
    );

    const verifiedPayments = paymentsRes.rows.filter((p: any) => p.status === 'verified');

    const feeCategories: any[] = enrollmentsRes.rows.map((e: any) => {
      const enrollPaid = verifiedPayments
        .filter((p: any) => Number(p.enrollment_id) === Number(e.id))
        .reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0);
      const actual = parseFloat(e.calculated_total_fee || e.course_fee || '0');
      const discount = Math.min(Math.max(parseFloat(e.calculated_discount || '0'), 0), actual);
      const finalFee = Math.max(0, actual - discount);
      return {
        name: e.course_name || 'Course Fee',
        actual,
        discount,
        finalFee,
        paid: enrollPaid,
        remaining: Math.max(0, finalFee - enrollPaid),
      };
    });

    // If an older record has no enrollment, retain the student's course fee as
    // a fallback so the discontinue check still works.
    if (feeCategories.length === 0 && parseFloat(student.fee_amount || '0') > 0) {
      const actual = parseFloat(student.fee_amount || '0');
      const unassignedPaid = verifiedPayments
        .filter((p: any) => !p.enrollment_id)
        .reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0);
      feeCategories.push({
        name: student.course_name || 'Course Fee',
        actual, discount: 0, finalFee: actual, paid: unassignedPaid,
        remaining: Math.max(0, actual - unassignedPaid),
      });
    }

    const courseFee = feeCategories.reduce((sum, c) => sum + c.actual, 0);
    const courseDiscount = feeCategories.reduce((sum, c) => sum + c.discount, 0);
    const coursePaid = feeCategories.reduce((sum, c) => sum + c.paid, 0);

    // Hostel is a separate fee ledger and has its own discount/payment totals.
    const hostelRes = await query(
      `SELECT
         hr.id AS hostel_record_id,
         (COALESCE(hr.hostel_fee,0) + COALESCE(hr.mess_fee,0))::numeric AS total_fee,
         COALESCE(hr.discount,0)::numeric AS discount,
         COALESCE(hr.paid_amount,0)::numeric AS paid_amount,
         GREATEST(
           COALESCE(hr.hostel_fee,0) + COALESCE(hr.mess_fee,0)
           - COALESCE(hr.discount,0) - COALESCE(hr.paid_amount,0), 0
         )::numeric AS pending_balance
       FROM hostel_records hr
       WHERE hr.student_id=$1
       LIMIT 1`, [id]
    );

    const hostel = hostelRes.rows[0] || null;
    if (hostel) {
      const actual = parseFloat(hostel.total_fee || '0');
      const discount = Math.min(Math.max(parseFloat(hostel.discount || '0'), 0), actual);
      const paid = parseFloat(hostel.paid_amount || '0');
      const finalFee = Math.max(0, actual - discount);
      feeCategories.push({
        name: 'Hostel & Mess Fee',
        actual,
        discount,
        finalFee,
        paid,
        remaining: Math.max(0, finalFee - paid),
      });
    }

    const totalFee = feeCategories.reduce((sum, c) => sum + c.actual, 0);
    const totalDiscount = feeCategories.reduce((sum, c) => sum + c.discount, 0);
    const totalFinalFee = Math.max(0, totalFee - totalDiscount);
    const totalPaid = feeCategories.reduce((sum, c) => sum + c.paid, 0);
    const pendingDues = Math.max(0, totalFinalFee - totalPaid);

    const hostelFee = hostel ? parseFloat(hostel.total_fee || '0') : 0;
    const hostelDiscount = hostel ? parseFloat(hostel.discount || '0') : 0;
    const hostelPaid = hostel ? parseFloat(hostel.paid_amount || '0') : 0;
    const hostelPendingDues = hostel ? Math.max(0, hostelFee - hostelDiscount - hostelPaid) : 0;

    res.json({
      success: true,
      data: {
        student,
        enrollments: enrollmentsRes.rows,
        payments: paymentsRes.rows,
        totalPaid,
        courseFee,
        courseDiscount,
        coursePaid,
        hostelFee,
        hostelDiscount,
        hostelPaid,
        hostelPendingDues,
        totalFee,
        totalDiscount,
        totalFinalFee,
        pendingDues,
        feeCategories,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/students/:id/discontinue ─────────────────────────────────
router.post('/:id/discontinue', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { reason, force, disc_cert_10th, disc_cert_12th, disc_cert_diploma } = req.body;
    const existing = await query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    if (existing.rows[0].status === 'discontinued') {
      res.status(400).json({ success: false, message: 'Student is already discontinued' });
      return;
    }
    if (!force) {
      // Use the same discounted course + hostel ledgers shown in the
      // discontinue-details popup. Do not treat a course discount as unpaid dues.
      const enrollmentRes = await query(
        `SELECT
           COALESCE(e.total_fee,0)::numeric AS total_fee,
           COALESCE(e.discount,0)::numeric AS discount,
           COALESCE((
             SELECT SUM(p.amount) FROM payments p
             WHERE p.enrollment_id=e.id AND p.status='verified'
           ),0)::numeric AS paid
         FROM enrollments e
         WHERE e.student_id=$1`,
        [req.params.id]
      );
      const courseDue = enrollmentRes.rows.reduce((sum: number, r: any) => {
        const total = parseFloat(r.total_fee || '0');
        const discount = Math.min(Math.max(parseFloat(r.discount || '0'), 0), total);
        const paid = parseFloat(r.paid || '0');
        return sum + Math.max(0, total - discount - paid);
      }, 0);

      const hostelRes = await query(
        `SELECT GREATEST(
           COALESCE(hostel_fee,0) + COALESCE(mess_fee,0)
           - COALESCE(discount,0) - COALESCE(paid_amount,0), 0
         )::numeric AS pending
         FROM hostel_records WHERE student_id=$1 LIMIT 1`,
        [req.params.id]
      );
      const hostelDue = hostelRes.rows.length > 0 ? parseFloat(hostelRes.rows[0].pending || '0') : 0;
      const pendingDues = Math.max(0, courseDue + hostelDue);

      if (pendingDues > 0) {
        res.status(422).json({
          success: false,
          message: `Student has pending dues of ₹${pendingDues.toLocaleString()}. Use force=true to proceed anyway.`,
          pendingDues,
        });
        return;
      }
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE students
         SET status='discontinued', discontinued_at=NOW(), discontinued_reason=$1,
             disc_cert_10th=$2, disc_cert_12th=$3, disc_cert_diploma=$4
         WHERE id=$5 RETURNING *`,
        [reason || null,
         disc_cert_10th === true || disc_cert_10th === 'true',
         disc_cert_12th === true || disc_cert_12th === 'true',
         disc_cert_diploma === true || disc_cert_diploma === 'true',
         req.params.id]
      );
      // Mark enrollments as discontinued too
      await client.query(
        `UPDATE enrollments SET status='discontinued' WHERE student_id=$1 AND status='approved'`,
        [req.params.id]
      );
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0], message: 'Student discontinued successfully' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/students/:id/restore ─────────────────────────────────────
router.post('/:id/restore', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    if (existing.rows[0].status !== 'discontinued') {
      res.status(400).json({ success: false, message: 'Student is not discontinued' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE students
         SET status='active', discontinued_at=NULL, discontinued_reason=NULL,
             disc_cert_10th=false, disc_cert_12th=false, disc_cert_diploma=false
         WHERE id=$1 RETURNING *`,
        [req.params.id]
      );
      // Restore enrollments that were discontinued with this student
      await client.query(
        `UPDATE enrollments SET status='approved' WHERE student_id=$1 AND status='discontinued'`,
        [req.params.id]
      );
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0], message: 'Student restored successfully' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/students/:id ──────────────────────────────────────────────
router.get('/:id', authorize('super_admin', 'admin', 'incharge', 'teacher', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role === 'student') {
      const own = await query('SELECT id FROM students WHERE user_id=$1', [req.user!.id]);
      if (own.rows.length === 0 || Number(own.rows[0].id) !== Number(req.params.id)) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return;
      }
    }
    const result = await query(
      `SELECT s.*,
              c.course_name, c.fee_amount AS course_fee_amount, c.is_free AS course_is_free,
              cc.category_name AS master_course_name,
              b.batch_name, b.start_date AS batch_start_date, b.end_date AS batch_end_date
       FROM students s
       LEFT JOIN courses c  ON c.id  = s.course_id
       LEFT JOIN course_categories cc ON cc.id = c.category_id
       LEFT JOIN batches b  ON b.id  = s.batch_id
       WHERE s.id=$1`, [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/students ─────────────────────────────────────────────────
// Creates student using a DB transaction. Does NOT auto-create a users login.
// Returns HTTP 409 DUPLICATE_EMAIL if email already exists in students or users.
router.post('/', authorize('super_admin', 'admin'), uploadPhoto.single('photo'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      full_name, mobile, email, date_of_birth, gender, address,
      parent_name, parent_mobile, parent_present, guardian_type,
      course_id, batch_id, admission_date, status,
      cert_10th_collected, cert_12th_collected, cert_diploma_collected,
      consent_given,
      initial_payment, payment_method, payment_type_label,
      internship_monthly, internship_months,
      accommodation_type,
    } = req.body;

    // ── 1. Validate inputs ──
    const validErr = validateStudentInput(req.body);
    if (validErr) {
      res.status(400).json({ success: false, message: validErr });
      return;
    }

    const emailNorm = email && String(email).trim() !== ''
      ? String(email).trim().toLowerCase()
      : null;

    // ── 2. Duplicate email check (students + users) — only when email provided ──
    if (emailNorm) {
      const dupStudent = await query('SELECT id FROM students WHERE LOWER(email)=$1', [emailNorm]);
      if (dupStudent.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: 'DUPLICATE_EMAIL',
          message: 'A student with this email already exists. Please use a different email address.',
        });
        return;
      }
      const dupUser = await query('SELECT id FROM users WHERE LOWER(email)=$1', [emailNorm]);
      if (dupUser.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: 'DUPLICATE_EMAIL',
          message: 'This email is already registered as a system user. Please use a different email address.',
        });
        return;
      }
    }

    // ── 3. Begin transaction ──
    await client.query('BEGIN');

    if (course_id && batch_id) {
      const batchCheck = await client.query(
        'SELECT 1 FROM batches WHERE id=$1 AND course_id=$2',
        [batch_id, course_id]
      );
      if (batchCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, message: 'Selected batch does not belong to the selected course' });
        return;
      }
    }

    const student_id = await generateStudentId(client);
    const photo_url  = req.file ? `/uploads/photos/${req.file.filename}` : null;

    const cert10  = cert_10th_collected  === 'true' || cert_10th_collected  === true;
    const cert12  = cert_12th_collected  === 'true' || cert_12th_collected  === true;
    const certDip = cert_diploma_collected === 'true' || cert_diploma_collected === true;

    // ── 4. Create student record ──
    // Auto-calculate completion date for FREE courses (admission_date + 3 months)
    let courseCompletionDate: string | null = null;
    if (course_id) {
      const courseCheck = await client.query('SELECT is_free FROM courses WHERE id=$1', [course_id]);
      if (courseCheck.rows.length > 0 && courseCheck.rows[0].is_free) {
        const startDate = new Date(admission_date || new Date().toISOString().split('T')[0]);
        startDate.setMonth(startDate.getMonth() + 3);
        courseCompletionDate = startDate.toISOString().split('T')[0];
      }
    }

    const consentGiven = consent_given === 'true' || consent_given === true;

    const accommodationType = accommodation_type === 'hostel' ? 'hostel' : 'day_scholar';

    const studentResult = await client.query(
      `INSERT INTO students (
         student_id, full_name, mobile, email, date_of_birth, gender,
         address, parent_name, parent_mobile, parent_present, guardian_type,
         photo_url, course_id, batch_id, admission_date, status,
         cert_10th_collected, cert_12th_collected, cert_diploma_collected,
         consent_given,
         uniform_received, course_completion_date, accommodation_type
       ) VALUES (
         $1,  $2,  $3,  $4,  $5,  $6,
         $7,  $8,  $9,  $10, $11,
         $12, $13, $14, $15, $16,
         $17, $18, $19, $20,
         $21, $22, $23
       ) RETURNING *`,
      [
        student_id,
        String(full_name).trim(),
        String(mobile).trim(),
        emailNorm,
        date_of_birth || null,
        gender || null,
        address || null,
        parent_name || null,
        parent_mobile || null,
        parent_present === 'true' || parent_present === true,
        guardian_type || null,
        photo_url,
        course_id || null,
        batch_id || null,
        admission_date || new Date().toISOString().split('T')[0],
        status || 'active',
        cert10,
        cert12,
        certDip,
        consentGiven,
        false,
        courseCompletionDate,
        accommodationType,
      ]
    );
    const newStudent = studentResult.rows[0];

    // ── 5. Auto-enrollment if course selected ──
    let enrollmentId: number | null = null;
    if (course_id) {
      // Get the actual course fee
      const courseResult = await client.query(
        'SELECT fee_amount, is_free FROM courses WHERE id=$1', [course_id]
      );
      const courseFeeAmount = courseResult.rows.length > 0
        ? parseFloat(courseResult.rows[0].fee_amount || '0')
        : 0;

      const enrollResult = await client.query(
        `INSERT INTO enrollments (student_id, course_id, batch_id, course_fee, status, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, 'approved', $5, NOW())
         ON CONFLICT (student_id, course_id) DO NOTHING
         RETURNING id`,
        [newStudent.id, course_id, batch_id || null, courseFeeAmount, req.user!.id]
      );
      if (enrollResult.rows.length > 0) {
        enrollmentId = enrollResult.rows[0].id;
        // Sync course/batch to student
        await client.query(
          `UPDATE students SET course_id=$1, batch_id=$2,
             admission_date = COALESCE($3::date, admission_date, CURRENT_DATE)
           WHERE id=$4`,
          [course_id, batch_id || null, admission_date || null, newStudent.id]
        );
      }
    }

    // ── 6. Record initial payment if provided ──
    const initPayAmt = Number(initial_payment) || 0;
    if (initPayAmt > 0 && enrollmentId) {
      // Resolve payment_method to a payment_method_id if provided
      let paymentMethodId: number | null = null;
      if (payment_method) {
        const pmResult = await client.query(
          'SELECT id FROM payment_methods WHERE method_type ILIKE $1 AND is_enabled=true LIMIT 1',
          [payment_method]
        );
        if (pmResult.rows.length > 0) {
          paymentMethodId = pmResult.rows[0].id;
        }
      }

      await client.query(
        `INSERT INTO payments (student_id, enrollment_id, payment_method_id, amount,
           payment_date, payment_type, notes, status, verified_by, verified_at)
         VALUES ($1, $2, $3, $4, $5, 'initial', $6, 'verified', $7, NOW())`,
        [
          newStudent.id,
          enrollmentId,
          paymentMethodId,
          initPayAmt,
          admission_date || new Date().toISOString().split('T')[0],
          payment_type_label || 'Initial payment at admission',
          req.user!.id,
        ]
      );
    }

    // ── 7. Record internship plan as notes (NOT as payment) ──
    const monthlyAmt = Number(internship_monthly) || 0;
    const months     = Number(internship_months) || 0;
    if (monthlyAmt > 0 && months > 0 && enrollmentId) {
      const planNote = `Internship Plan: ₹${monthlyAmt.toLocaleString('en-IN')} × ${months} months = ₹${(monthlyAmt * months).toLocaleString('en-IN')} (PLAN ONLY — not actual payment)`;
      await client.query(
        `UPDATE enrollments SET notes = COALESCE(notes || E'\n', '') || $1 WHERE id = $2`,
        [planNote, enrollmentId]
      );
    }

    // ── 8. Auto-create hostel record if accommodation is hostel ──
    if (accommodationType === 'hostel') {
      await client.query(
        `INSERT INTO hostel_records (student_id, hostel_fee, mess_fee, paid_amount)
         VALUES ($1, 0, 0, 0)
         ON CONFLICT (student_id) DO NOTHING`,
        [newStudent.id]
      );
    }

    // ── 9. Commit ──
    await client.query('COMMIT');

    res.status(201).json({ success: true, data: newStudent });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /students error:', err);
    if (err.code === '23505') {
      // Unique constraint violation — should have been caught above, but handle defensively
      res.status(409).json({
        success: false,
        error: 'DUPLICATE_EMAIL',
        message: 'A user or student with this email already exists. Please use a different email address.',
      });
    } else {
      res.status(500).json({ success: false, message: 'Server error creating student' });
    }
  } finally {
    client.release();
  }
});

// ── PUT /api/students/:id ──────────────────────────────────────────────
router.put('/:id', authorize('super_admin', 'admin'), uploadPhoto.single('photo'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      full_name, mobile, email, date_of_birth, gender, address,
      parent_name, parent_mobile, guardian_type, parent_present, status,
      cert_10th_collected, cert_12th_collected, cert_diploma_collected,
      course_id, batch_id, admission_date,
    } = req.body;

    const validErr = validateStudentInput(req.body);
    if (validErr) { res.status(400).json({ success: false, message: validErr }); return; }

    const existing = await query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    const emailNorm = email && String(email).trim() !== ''
      ? String(email).trim().toLowerCase()
      : null;

    // Check duplicate email (excluding self) in students — only when email provided
    const dupStudent = emailNorm
      ? await query('SELECT id FROM students WHERE LOWER(email)=$1 AND id!=$2', [emailNorm, req.params.id])
      : { rows: [] };
    if (dupStudent.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'DUPLICATE_EMAIL',
        message: 'This email is already used by another student.',
      });
      return;
    }

    if (course_id && batch_id) {
      const batchCheck = await query(
        'SELECT 1 FROM batches WHERE id=$1 AND course_id=$2',
        [batch_id, course_id]
      );
      if (batchCheck.rows.length === 0) {
        res.status(400).json({ success: false, message: 'Selected batch does not belong to the selected course' });
        return;
      }
    }

    const photo_url = req.file
      ? `/uploads/photos/${req.file.filename}`
      : existing.rows[0].photo_url;

    const cert10  = cert_10th_collected  === 'true' || cert_10th_collected  === true;
    const cert12  = cert_12th_collected  === 'true' || cert_12th_collected  === true;
    const certDip = cert_diploma_collected === 'true' || cert_diploma_collected === true;
    const uniformReceived = (req.body as any).uniform_received === 'true' || (req.body as any).uniform_received === true;

    const consentGiven = (req.body as any).consent_given === 'true' || (req.body as any).consent_given === true;

    const newAccommodationType = (req.body as any).accommodation_type === 'hostel' ? 'hostel' : 'day_scholar';

    const result = await query(
      `UPDATE students
       SET full_name=$1, mobile=$2, email=$3, date_of_birth=$4, gender=$5,
           address=$6, parent_name=$7, parent_mobile=$8, guardian_type=$9,
           parent_present=$10, photo_url=$11, status=$12,
           cert_10th_collected=$13, cert_12th_collected=$14, cert_diploma_collected=$15,
           uniform_received=$16, consent_given=$17, accommodation_type=$18,
           course_id=$19, batch_id=$20, admission_date=COALESCE($21::date, admission_date)
       WHERE id=$22 RETURNING *`,
      [
        String(full_name).trim(), String(mobile).trim(), emailNorm,
        date_of_birth || null, gender || null,
        address || null, parent_name || null, parent_mobile || null,
        guardian_type || null,
        parent_present === 'true' || parent_present === true,
        photo_url,
        status || 'active',
        cert10, cert12, certDip,
        uniformReceived,
        consentGiven,
        newAccommodationType,
        course_id || null,
        batch_id || null,
        admission_date || null,
        req.params.id,
      ]
    );

    // Keep the student's formal enrollment synchronized with the selected
    // course/batch. This makes Candidate Edit -> Candidates and Enrollment
    // show the same course/batch data. If the student has no enrollment yet,
    // create one automatically.
    if (course_id) {
      const courseResult = await query(
        'SELECT fee_amount FROM courses WHERE id=$1', [course_id]
      );
      const courseFee = courseResult.rows.length > 0
        ? Number(courseResult.rows[0].fee_amount || 0)
        : 0;

      const targetEnrollment = await query(
        'SELECT id FROM enrollments WHERE student_id=$1 AND course_id=$2 LIMIT 1',
        [req.params.id, course_id]
      );

      if (targetEnrollment.rows.length > 0) {
        await query(
          `UPDATE enrollments
           SET batch_id=$1, status='approved', approved_by=$2, approved_at=COALESCE(approved_at, NOW()),
               updated_at=NOW()
           WHERE id=$3`,
          [batch_id || null, req.user!.id, targetEnrollment.rows[0].id]
        );
      } else {
        // If this student already has a primary enrollment, update it to the
        // newly selected course instead of creating duplicate enrollments.
        const existingEnrollment = await query(
          'SELECT id FROM enrollments WHERE student_id=$1 ORDER BY created_at DESC LIMIT 1',
          [req.params.id]
        );

        if (existingEnrollment.rows.length > 0) {
          await query(
            `UPDATE enrollments
             SET course_id=$1, batch_id=$2, course_fee=$3, status='approved',
                 approved_by=$4, approved_at=COALESCE(approved_at, NOW()), updated_at=NOW()
             WHERE id=$5`,
            [course_id, batch_id || null, courseFee, req.user!.id, existingEnrollment.rows[0].id]
          );
        } else {
          await query(
            `INSERT INTO enrollments
               (student_id, course_id, batch_id, course_fee, status, approved_by, approved_at)
             VALUES ($1,$2,$3,$4,'approved',$5,NOW())`,
            [req.params.id, course_id, batch_id || null, courseFee, req.user!.id]
          );
        }
      }
    }

    // Auto-manage hostel_record based on accommodation change
    if (newAccommodationType === 'hostel') {
      await query(
        `INSERT INTO hostel_records (student_id, hostel_fee, mess_fee, paid_amount)
         VALUES ($1, 0, 0, 0)
         ON CONFLICT (student_id) DO NOTHING`,
        [req.params.id]
      ).catch(() => {/* non-critical */});
    }

    // Sync uniform status to student_uniform table for cross-page sync
    await query(
      `INSERT INTO student_uniform (student_id, status, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (student_id) DO UPDATE
         SET status = EXCLUDED.status,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [req.params.id, uniformReceived ? 'received' : 'not_received', req.user!.id]
    ).catch(() => { /* non-critical */ });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /students/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── DELETE /api/students/:id ───────────────────────────────────────────
router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query('SELECT id, status, full_name, user_id FROM students WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    if (existing.rows[0].status !== 'discontinued') {
      res.status(400).json({ success: false, message: 'Only discontinued students can be permanently deleted' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sid = req.params.id;
      // Delete child records in FK-safe order (CASCADE handles most, explicit for safety)
      await client.query('DELETE FROM attendance WHERE student_id=$1', [sid]);
      await client.query('DELETE FROM payments WHERE student_id=$1', [sid]);
      await client.query('DELETE FROM enrollments WHERE student_id=$1', [sid]);
      await client.query('DELETE FROM video_progress WHERE student_id=$1', [sid]).catch(() => {});
      await client.query('DELETE FROM student_uniform WHERE student_id=$1', [sid]).catch(() => {});
      await client.query('DELETE FROM student_materials WHERE student_id=$1', [sid]).catch(() => {});
      // Unlink user account if exists (don't delete user, just unlink)
      if (existing.rows[0].user_id) {
        await client.query('UPDATE students SET user_id=NULL WHERE id=$1', [sid]);
      }
      await client.query('DELETE FROM students WHERE id=$1', [sid]);
      await client.query('COMMIT');
      res.json({ success: true, message: `Student "${existing.rows[0].full_name}" permanently deleted` });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/students/:id/cert ────────────────────────────────────────
router.post('/:id/cert', authorize('super_admin', 'admin'), uploadCertificate.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { cert_type } = req.body;
    if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }
    const allowed = ['10th', '12th', 'diploma'];
    if (!allowed.includes(cert_type)) { res.status(400).json({ success: false, message: 'Invalid cert_type' }); return; }
    const colMap: Record<string, string> = { '10th': 'cert_10th_url', '12th': 'cert_12th_url', 'diploma': 'cert_diploma_url' };
    const col = colMap[cert_type];
    const url = `/uploads/certificates/${req.file.filename}`;
    const result = await query(
      `UPDATE students SET ${col}=$1 WHERE id=$2 RETURNING id, cert_10th_url, cert_12th_url, cert_diploma_url`,
      [url, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Student not found' }); return; }
    res.json({ success: true, data: result.rows[0], url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/students/:id/consent-image ──────────────────────────────
router.post('/:id/consent-image', authorize('super_admin', 'admin'), uploadConsentImage.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: 'No image file uploaded' }); return; }
    const url = `/uploads/consent/${req.file.filename}`;
    const result = await query(
      `UPDATE students SET consent_image_url=$1, consent_given=true WHERE id=$2 RETURNING id, consent_image_url, consent_pdf_url, consent_video_url, consent_given`,
      [url, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Student not found' }); return; }
    res.json({ success: true, data: result.rows[0], url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error uploading consent image' });
  }
});

// ── POST /api/students/:id/consent-pdf ────────────────────────────────
router.post('/:id/consent-pdf', authorize('super_admin', 'admin'), uploadConsentPdf.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: 'No PDF file uploaded' }); return; }
    const url = `/uploads/consent/${req.file.filename}`;
    const result = await query(
      `UPDATE students SET consent_pdf_url=$1, consent_given=true WHERE id=$2 RETURNING id, consent_image_url, consent_pdf_url, consent_video_url, consent_given`,
      [url, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Student not found' }); return; }
    res.json({ success: true, data: result.rows[0], url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error uploading consent PDF' });
  }
});

// ── POST /api/students/:id/consent-video ──────────────────────────────
router.post('/:id/consent-video', authorize('super_admin', 'admin'), uploadConsentVideo.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: 'No video file uploaded' }); return; }
    const url = `/uploads/consent/${req.file.filename}`;
    const result = await query(
      `UPDATE students SET consent_video_url=$1, consent_given=true WHERE id=$2 RETURNING id, consent_image_url, consent_pdf_url, consent_video_url, consent_given`,
      [url, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Student not found' }); return; }
    res.json({ success: true, data: result.rows[0], url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error uploading consent video' });
  }
});

export default router;
