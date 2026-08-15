import { Router, Response } from 'express';
import { query } from '../config/db';
import { hashPassword } from '../utils/bcrypt';
import { generateStudentId } from '../utils/studentId';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { uploadPhoto } from '../middleware/upload';
import { stringify } from 'csv-stringify/sync';
import path from 'path';

const router = Router();
router.use(authenticate);

// ── Validation helper ──────────────────────────────────────────
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStudentInput(body: any): string | null {
  const { full_name, mobile, email } = body;
  if (!full_name || String(full_name).trim().length < 3) return 'Student name must be at least 3 characters';
  if (String(full_name).trim().length > 150) return 'Student name must be under 150 characters';
  if (!mobile) return 'Mobile number is required';
  if (!MOBILE_REGEX.test(String(mobile).trim())) return 'Invalid Mobile Number — must be 10 digits starting with 6, 7, 8, or 9';
  if (!email) return 'Email is required';
  if (!EMAIL_REGEX.test(String(email).trim())) return 'Invalid Email Address';
  return null;
}


// GET /api/students
router.get('/', authorize('super_admin', 'admin', 'faculty'), async (req: AuthRequest, res: Response) => {
  try {
    const { search, course_id, batch_id, status, page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    let q = `SELECT s.*, c.course_name, b.batch_name
             FROM students s
             LEFT JOIN courses c ON c.id = s.course_id
             LEFT JOIN batches b ON b.id = s.batch_id
             WHERE s.status != 'discontinued'`;
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (s.full_name ILIKE $${params.length} OR s.email ILIKE $${params.length} OR s.student_id ILIKE $${params.length} OR s.mobile ILIKE $${params.length})`;
    }
    if (course_id) { params.push(course_id); q += ` AND s.course_id=$${params.length}`; }
    if (batch_id) { params.push(batch_id); q += ` AND s.batch_id=$${params.length}`; }
    if (status) { params.push(status); q += ` AND s.status=$${params.length}`; }

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

// GET /api/students/export
router.get('/export', authorize('super_admin', 'admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT s.student_id, s.full_name, s.mobile, s.email, s.date_of_birth, s.gender,
              s.address, s.parent_name, s.parent_mobile, c.course_name, b.batch_name,
              s.admission_date, s.status
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

// GET /api/students/discontinued
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

// GET /api/students/:id/discontinue-details  — fetch all info for confirmation popup
router.get('/:id/discontinue-details', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Student info
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

    // Enrollments (certificates)
    const enrollmentsRes = await query(
      `SELECT e.*, c.course_name FROM enrollments e
       LEFT JOIN courses c ON c.id = e.course_id
       WHERE e.student_id=$1 ORDER BY e.enrolled_at DESC`, [id]
    );

    // Payments
    const paymentsRes = await query(
      `SELECT p.*, pm.method_type FROM payments p
       LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
       WHERE p.student_id=$1 ORDER BY p.payment_date DESC`, [id]
    );

    // Calculate dues using verified payments only
    const verifiedPayments = paymentsRes.rows.filter((p: any) => p.status === 'verified');
    const totalPaid = verifiedPayments.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
    const courseFee = parseFloat(student.fee_amount || '0');
    const pendingDues = Math.max(0, courseFee - totalPaid);

    // Fee categories: proportional split of existing course fee_amount (no new DB tables)
    // Tuition 51.4%, Uniform 5.7%, Exam 8.6%, Hostel & Mess 34.3%
    let paidPool = totalPaid;
    const feeCategories = courseFee > 0 ? [
      { name: 'Tuition Fee',       pct: 0.514 },
      { name: 'Uniform Fee',       pct: 0.057 },
      { name: 'Exam Fee',          pct: 0.086 },
      { name: 'Hostel & Mess Fee', pct: 0.343 },
    ].map(cat => {
      const actual  = Math.round(courseFee * cat.pct);
      const paid    = Math.min(paidPool, actual);
      paidPool      = Math.max(0, paidPool - paid);
      return { name: cat.name, actual, paid, remaining: Math.max(0, actual - paid) };
    }) : [];

    res.json({
      success: true,
      data: {
        student,
        enrollments: enrollmentsRes.rows,
        payments: paymentsRes.rows,
        totalPaid,
        courseFee,
        pendingDues,
        feeCategories,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/students/:id/discontinue
router.post('/:id/discontinue', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { reason, force, disc_cert_10th, disc_cert_12th, disc_cert_diploma } = req.body;

    // Check if student exists and is active
    const existing = await query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    const student = existing.rows[0];
    if (student.status === 'discontinued') {
      res.status(400).json({ success: false, message: 'Student is already discontinued' });
      return;
    }

    // Check pending dues unless force=true
    if (!force) {
      const paymentsRes = await query(
        `SELECT SUM(amount) as total_paid FROM payments WHERE student_id=$1 AND status='verified'`,
        [req.params.id]
      );
      const courseRes = await query('SELECT fee_amount FROM courses WHERE id=$1', [student.course_id]);
      if (courseRes.rows.length > 0) {
        const totalPaid = parseFloat(paymentsRes.rows[0].total_paid || '0');
        const courseFee = parseFloat(courseRes.rows[0].fee_amount || '0');
        const pendingDues = courseFee - totalPaid;
        if (pendingDues > 0) {
          res.status(422).json({
            success: false,
            message: `Student has pending dues of ₹${pendingDues.toLocaleString()}. Use force=true to proceed anyway.`,
            pendingDues,
          });
          return;
        }
      }
    }

    const result = await query(
      `UPDATE students
       SET status='discontinued', discontinued_at=NOW(), discontinued_reason=$1,
           disc_cert_10th=$2, disc_cert_12th=$3, disc_cert_diploma=$4
       WHERE id=$5 RETURNING *`,
      [reason || null, disc_cert_10th === true || disc_cert_10th === 'true', disc_cert_12th === true || disc_cert_12th === 'true', disc_cert_diploma === true || disc_cert_diploma === 'true', req.params.id]
    );
    res.json({ success: true, data: result.rows[0], message: 'Student discontinued successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/students/:id/restore
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
    const result = await query(
      `UPDATE students SET status='active', discontinued_at=NULL, discontinued_reason=NULL WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows[0], message: 'Student restored successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/students/:id
router.get('/:id', authorize('super_admin', 'admin', 'faculty', 'student'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT s.*, c.course_name, b.batch_name
       FROM students s
       LEFT JOIN courses c ON c.id = s.course_id
       LEFT JOIN batches b ON b.id = s.batch_id
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

// POST /api/students
router.post('/', authorize('super_admin', 'admin'), uploadPhoto.single('photo'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      full_name, mobile, email, date_of_birth, gender, address,
      parent_name, parent_mobile, course_id, batch_id, admission_date, status,
      cert_10th_collected, cert_12th_collected, cert_diploma_collected
    } = req.body;

    const validErr = validateStudentInput(req.body);
    if (validErr) { res.status(400).json({ success: false, message: validErr }); return; }

    const emailNorm = String(email).trim().toLowerCase();
    const exists = await query('SELECT id FROM students WHERE LOWER(email)=$1', [emailNorm]);
    if (exists.rows.length > 0) {
      res.status(409).json({ success: false, message: 'Email already exists' });
      return;
    }
    const student_id = await generateStudentId();
    const photo_url = req.file ? `/uploads/photos/${req.file.filename}` : null;

    const cert10 = cert_10th_collected === 'true' || cert_10th_collected === true;
    const cert12 = cert_12th_collected === 'true' || cert_12th_collected === true;
    const certDip = cert_diploma_collected === 'true' || cert_diploma_collected === true;

    // Create user account for student
    const hash = await hashPassword(`Student@${String(mobile).trim().slice(-4)}`);
    const userResult = await query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1,$2,$3,\'student\') RETURNING id',
      [String(full_name).trim(), emailNorm, hash]
    );
    const userId = userResult.rows[0].id;

    const result = await query(
      `INSERT INTO students (student_id, user_id, full_name, mobile, email, date_of_birth, gender,
        address, parent_name, parent_mobile, photo_url, course_id, batch_id, admission_date, status,
        cert_10th_collected, cert_12th_collected, cert_diploma_collected)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [student_id, userId, String(full_name).trim(), String(mobile).trim(), emailNorm,
       date_of_birth || null, gender || null,
       address || null, parent_name || null, parent_mobile || null, photo_url,
       course_id || null, batch_id || null,
       admission_date || new Date().toISOString().split('T')[0], status || 'active',
       cert10, cert12, certDip]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /students error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/students/:id
router.put('/:id', authorize('super_admin', 'admin'), uploadPhoto.single('photo'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      full_name, mobile, email, date_of_birth, gender, address,
      parent_name, parent_mobile, status,
      cert_10th_collected, cert_12th_collected, cert_diploma_collected
    } = req.body;

    const validErr = validateStudentInput(req.body);
    if (validErr) { res.status(400).json({ success: false, message: validErr }); return; }

    const existing = await query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    const emailNorm = String(email).trim().toLowerCase();
    // Check duplicate email (excluding self)
    const dupEmail = await query('SELECT id FROM students WHERE LOWER(email)=$1 AND id!=$2', [emailNorm, req.params.id]);
    if (dupEmail.rows.length > 0) {
      res.status(409).json({ success: false, message: 'Email already exists' });
      return;
    }

    const photo_url = req.file
      ? `/uploads/photos/${req.file.filename}`
      : existing.rows[0].photo_url;

    const cert10 = cert_10th_collected === 'true' || cert_10th_collected === true;
    const cert12 = cert_12th_collected === 'true' || cert_12th_collected === true;
    const certDip = cert_diploma_collected === 'true' || cert_diploma_collected === true;

    // course_id, batch_id, admission_date are managed by Enrollment — preserve existing values
    const result = await query(
      `UPDATE students SET full_name=$1, mobile=$2, email=$3, date_of_birth=$4, gender=$5,
        address=$6, parent_name=$7, parent_mobile=$8, photo_url=$9, status=$10,
        cert_10th_collected=$11, cert_12th_collected=$12, cert_diploma_collected=$13
       WHERE id=$14 RETURNING *`,
      [String(full_name).trim(), String(mobile).trim(), emailNorm, date_of_birth || null, gender || null,
       address || null, parent_name || null, parent_mobile || null, photo_url, status || 'active',
       cert10, cert12, certDip,
       req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /students/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// DELETE /api/students/:id — hard delete, only allowed for discontinued students
router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query('SELECT id, status, full_name FROM students WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    if (existing.rows[0].status !== 'discontinued') {
      res.status(400).json({ success: false, message: 'Only discontinued students can be permanently deleted' });
      return;
    }
    // Hard delete — cascades to payments, attendance, enrollments via FK
    await query('DELETE FROM students WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: `Student "${existing.rows[0].full_name}" permanently deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
