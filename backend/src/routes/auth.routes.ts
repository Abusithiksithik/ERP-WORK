import { Router, Response } from 'express';
import { query } from '../config/db';
import { comparePassword, hashPassword } from '../utils/bcrypt';
import { generateToken } from '../utils/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password required' });
      return;
    }

    // Trim both — prevents hidden whitespace/carriage return issues
    const emailClean    = String(email).trim().toLowerCase();
    const passwordClean = String(password).trim();

    const result = await query(
      'SELECT * FROM users WHERE LOWER(email) = $1 AND is_active = true',
      [emailClean]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const user  = result.rows[0];
    const valid = await comparePassword(passwordClean, user.password_hash);

    if (!valid) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id:        user.id,
          full_name: user.full_name,
          email:     user.email,
          role:      user.role,
          photo_url: user.photo_url || null,
        }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT id, full_name, email, role, is_active, photo_url, created_at FROM users WHERE id = $1',
      [req.user!.id]
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

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      res.status(400).json({ success: false, message: 'Old and new passwords required' });
      return;
    }
    if (new_password.length < 6) {
      res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
      return;
    }
    const result = await query('SELECT * FROM users WHERE id = $1', [req.user!.id]);
    const user   = result.rows[0];
    const valid  = await comparePassword(String(old_password).trim(), user.password_hash);
    if (!valid) {
      res.status(400).json({ success: false, message: 'Current password is incorrect' });
      return;
    }
    const newHash = await hashPassword(String(new_password).trim());
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user!.id]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
