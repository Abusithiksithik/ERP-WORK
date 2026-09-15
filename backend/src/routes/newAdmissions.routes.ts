import { Router, Response } from 'express';
import { pool, query } from '../config/db';
import { generateStudentId } from '../utils/studentId';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ── Validation helpers (same as students.routes) ─────────────────────
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const EMAIL_REGEX  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInput(body: any): string | null {
  const { full_name, mobile, email } = body;
  if (!full_name || String(full_name).trim().length < 3)
    return 'Full name must be at least 3 characters';
  if (String(full_name).trim().length > 150)
    return 'Full name must be under 150 characters';
  if (!mobile) return 'Mobile number is required';
  if (!MOBILE_REGEX.test(String(mobile).trim()))
    return 'Invalid Mobile Number — must be 10 digits starting with 6, 7, 8, or 9';
  // email is optional — only validate format if provided
  if (email && String(email).trim() !== '' && !EMAIL_REGEX.test(String(email).trim().toLowerCase()))
    return 'Invalid Email Address';
  return null;
}

// ── GET /api/new-admissions ───────────────────────────────────────────
// Returns new_admissions joined with student basic details (live from students table)
router.get('/', authorize('super_admin', 'admin', 'incharge'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT
         na.id          AS admission_id,
         na.student_id,
         na.created_at  AS admission_created_at,
         na.source,
         s.full_name,
         s.mobile,
         s.email,
         s.date_of_birth,
         s.admission_date AS joining_date,
         s.gender,
         s.address
       FROM new_admissions na
       JOIN students s ON s.id = na.student_id
       ORDER BY na.created_at DESC`,
      []
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /new-admissions error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/new-admissions ─────────────────────────────────────────
// Creates a minimal student record + a new_admissions row inside a transaction.
router.post('/', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { full_name, mobile, email, date_of_birth, gender, address, admission_date, source } = req.body;

    const validErr = validateInput(req.body);
    if (validErr) {
      res.status(400).json({ success: false, message: validErr });
      return;
    }

    const emailNorm = email && String(email).trim() !== ''
      ? String(email).trim().toLowerCase()
      : null;

    // Source is managed from Settings → Admission Sources.
    const sourceNorm = source && String(source).trim() !== '' ? String(source).trim() : null;

    const genderNorm = gender && String(gender).trim() !== ''
      ? ({ male: 'Male', female: 'Female', other: 'Other' } as Record<string, string>)[String(gender).trim().toLowerCase()] || null
      : null;

    if (sourceNorm) {
      const sourceCheck = await query(
        'SELECT 1 FROM admission_sources WHERE source_name=$1 AND is_active=true',
        [sourceNorm]
      );
      if (sourceCheck.rows.length === 0) {
        res.status(400).json({ success: false, message: 'Please select an active admission source' });
        return;
      }
    }

    // Duplicate email checks (only when email provided)
    if (emailNorm) {
      const dupStudent = await query('SELECT id FROM students WHERE LOWER(email)=$1', [emailNorm]);
      if (dupStudent.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: 'DUPLICATE_EMAIL',
          message: 'A student with this email already exists.',
        });
        return;
      }
      const dupUser = await query('SELECT id FROM users WHERE LOWER(email)=$1', [emailNorm]);
      if (dupUser.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: 'DUPLICATE_EMAIL',
          message: 'This email is already used by a system user.',
        });
        return;
      }
    }

    await client.query('BEGIN');

    const student_id = await generateStudentId(client);

    // Insert minimal student record (no course/batch/photo/fees)
    const studentResult = await client.query(
      `INSERT INTO students (
         student_id, full_name, mobile, email, date_of_birth, gender,
         address, admission_date, status,
         cert_10th_collected, cert_12th_collected, cert_diploma_collected,
         consent_given, uniform_received, accommodation_type
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, 'active',
         false, false, false,
         false, false, 'day_scholar'
       ) RETURNING id`,
      [
        student_id,
        String(full_name).trim(),
        String(mobile).trim(),
        emailNorm,
        date_of_birth || null,
        genderNorm,
        address || null,
        admission_date || new Date().toISOString().split('T')[0],
      ]
    );

    const newStudentId = studentResult.rows[0].id;

    // Insert new_admissions row
    const naResult = await client.query(
      `INSERT INTO new_admissions (student_id, source) VALUES ($1, $2)
       RETURNING id AS admission_id, student_id, created_at AS admission_created_at, source`,
      [newStudentId, sourceNorm]
    );

    await client.query('COMMIT');

    res.status(201).json({ success: true, data: naResult.rows[0] });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /new-admissions error:', err);
    if (err.code === '23505') {
      res.status(409).json({
        success: false,
        error: 'DUPLICATE_EMAIL',
        message: 'A student with this email already exists.',
      });
    } else {
      res.status(500).json({ success: false, message: 'Server error creating admission' });
    }
  } finally {
    client.release();
  }
});

// ── DELETE /api/new-admissions/:id ───────────────────────────────────
// Deletes ONLY the new_admissions row. Never touches students/enrollments/etc.
router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await query(
      'SELECT na.id, na.student_id FROM new_admissions na WHERE na.id=$1',
      [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'New admission record not found' });
      return;
    }

    await query('DELETE FROM new_admissions WHERE id=$1', [id]);

    res.json({ success: true, message: 'New admission entry removed' });
  } catch (err) {
    console.error('DELETE /new-admissions/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
