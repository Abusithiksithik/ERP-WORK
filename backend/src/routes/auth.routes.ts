import { Router, Response } from 'express';
import { query } from '../config/db';
import { comparePassword, hashPassword } from '../utils/bcrypt';
import { generateToken } from '../utils/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password required' });
      return;
    }
    const result = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    if (result.rows.length === 0) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }
    // const user = result.rows[0];
   const user = result.rows[0];

console.log("========== LOGIN DEBUG ==========");
console.log("Email:", email);
console.log("Input Password:", password);
console.log("DB Email:", user.email);
console.log("DB Hash:", user.password_hash);

const valid = await comparePassword(password, user.password_hash);

console.log("Password Match:", valid);
console.log("================================");

if (!valid) {
  res.status(401).json({
    success: false,
    message: "Invalid credentials"
  });
  return;
}
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = $1', [req.user!.id]);
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
    const user = result.rows[0];
    const valid = await comparePassword(old_password, user.password_hash);
    if (!valid) {
      res.status(400).json({ success: false, message: 'Current password is incorrect' });
      return;
    }
    const newHash = await hashPassword(new_password);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user!.id]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, message: 'Email required' });
      return;
    }
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour
    await query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3', [token, expires, email]);
    console.log(`\n[RESET PASSWORD TOKEN for ${email}]:\nToken: ${token}\nExpires: ${expires}\nReset URL: http://localhost:3000/reset-password?token=${token}\n`);
    res.json({ success: true, message: 'Password reset token generated (check server console)' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res: Response) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      res.status(400).json({ success: false, message: 'Token and new password required' });
      return;
    }
    const result = await query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    if (result.rows.length === 0) {
      res.status(400).json({ success: false, message: 'Invalid or expired token' });
      return;
    }
    const newHash = await hashPassword(new_password);
    await query('UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2', [newHash, result.rows[0].id]);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
