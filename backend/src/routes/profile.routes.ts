import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadPhoto } from '../middleware/upload';

const router = Router();
router.use(authenticate);

// GET /api/profile
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.photo_url, u.created_at,
              f.mobile, f.specialization
       FROM users u LEFT JOIN faculty f ON f.user_id = u.id
       WHERE u.id = $1`,
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

// PUT /api/profile
router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const { full_name, mobile, specialization } = req.body;
    if (!full_name || String(full_name).trim().length < 2) {
      res.status(400).json({ success: false, message: 'Full name is required' });
      return;
    }
    await query('UPDATE users SET full_name=$1 WHERE id=$2', [String(full_name).trim(), req.user!.id]);
    await query(
      `INSERT INTO faculty (user_id, mobile, specialization) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET mobile=$2, specialization=$3`,
      [req.user!.id, mobile || null, specialization || null]
    );
    const result = await query(
      `SELECT u.id, u.full_name, u.email, u.role, u.photo_url,
              f.mobile, f.specialization
       FROM users u LEFT JOIN faculty f ON f.user_id = u.id
       WHERE u.id = $1`,
      [req.user!.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/profile/photo
router.post('/photo', uploadPhoto.single('photo'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No photo uploaded' });
      return;
    }
    const photo_url = `/uploads/photos/${req.file.filename}`;
    await query('UPDATE users SET photo_url=$1 WHERE id=$2', [photo_url, req.user!.id]);
    res.json({ success: true, photo_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
