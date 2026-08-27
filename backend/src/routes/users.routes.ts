import { Router, Response } from 'express';
import { query } from '../config/db';
import { hashPassword } from '../utils/bcrypt';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const ALLOWED_ROLES = ['admin', 'incharge', 'teacher'];

// GET /api/users
router.get('/', authorize('super_admin', 'admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at,
              f.mobile, f.specialization
       FROM users u
       LEFT JOIN faculty f ON f.user_id = u.id
       WHERE u.role IN ('admin','incharge','teacher')
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/users
router.post('/', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { full_name, email, password, role, mobile, specialization } = req.body;
    if (!full_name || !email || !password || !role) {
      res.status(400).json({ success: false, message: 'full_name, email, password, role required' });
      return;
    }
    if (!ALLOWED_ROLES.includes(role)) {
      res.status(400).json({ success: false, message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
      return;
    }
    const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      res.status(409).json({ success: false, message: 'Email already exists' });
      return;
    }
    const hash = await hashPassword(password);
    const userResult = await query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, full_name, email, role',
      [full_name, email, hash, role]
    );
    const user = userResult.rows[0];
    // Store mobile/specialization for all user types (not just faculty)
    if (mobile || specialization) {
      await query(
        `INSERT INTO faculty (user_id, mobile, specialization) VALUES ($1,$2,$3)
         ON CONFLICT (user_id) DO UPDATE SET mobile=$2, specialization=$3`,
        [user.id, mobile || null, specialization || null]
      );
    }
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/users/:id
router.get('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at,
              f.mobile, f.specialization
       FROM users u LEFT JOIN faculty f ON f.user_id = u.id
       WHERE u.id = $1`, [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/users/:id
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { full_name, email, role, is_active, mobile, specialization, password } = req.body;
    if (role && !ALLOWED_ROLES.includes(role)) {
      res.status(400).json({ success: false, message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
      return;
    }
    let updateQuery = 'UPDATE users SET full_name=$1, email=$2, role=$3, is_active=$4';
    const params: unknown[] = [full_name, email, role, is_active];
    if (password) {
      const hash = await hashPassword(password);
      updateQuery += `, password_hash=$${params.length + 1}`;
      params.push(hash);
    }
    updateQuery += ` WHERE id=$${params.length + 1} RETURNING id, full_name, email, role, is_active`;
    params.push(req.params.id);
    const result = await query(updateQuery, params);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    await query(
      `INSERT INTO faculty (user_id, mobile, specialization) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET mobile=$2, specialization=$3`,
      [req.params.id, mobile || null, specialization || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authorize('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    await query(`DELETE FROM users WHERE id=$1 AND role NOT IN ('super_admin')`, [req.params.id]);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
