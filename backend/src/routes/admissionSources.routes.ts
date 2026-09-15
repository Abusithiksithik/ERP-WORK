import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', authorize('super_admin', 'admin', 'incharge'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, source_name, is_active, created_at, updated_at
       FROM admission_sources
       ORDER BY is_active DESC, source_name ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /admission-sources error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const sourceName = String(req.body?.source_name || '').trim();
    if (!sourceName) {
      res.status(400).json({ success: false, message: 'Source name is required' });
      return;
    }
    if (sourceName.length > 50) {
      res.status(400).json({ success: false, message: 'Source name must be 50 characters or less' });
      return;
    }
    const result = await query(
      `INSERT INTO admission_sources (source_name)
       VALUES ($1)
       RETURNING id, source_name, is_active, created_at, updated_at`,
      [sourceName]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ success: false, message: 'This source already exists' });
      return;
    }
    console.error('POST /admission-sources error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const sourceName = String(req.body?.source_name || '').trim();
    if (!sourceName) {
      res.status(400).json({ success: false, message: 'Source name is required' });
      return;
    }
    const result = await query(
      `UPDATE admission_sources
       SET source_name=$1, updated_at=NOW()
       WHERE id=$2
       RETURNING id, source_name, is_active, created_at, updated_at`,
      [sourceName, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Source not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ success: false, message: 'This source already exists' });
      return;
    }
    console.error('PUT /admission-sources error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/:id/toggle', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE admission_sources
       SET is_active = NOT is_active, updated_at=NOW()
       WHERE id=$1
       RETURNING id, source_name, is_active, created_at, updated_at`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Source not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PATCH /admission-sources/:id/toggle error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM admission_sources WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Source not found' });
      return;
    }
    res.json({ success: true, message: 'Source deleted' });
  } catch (err) {
    console.error('DELETE /admission-sources/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
