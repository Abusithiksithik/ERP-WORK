import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const validateDates = (start_date: string | undefined, end_date: string | undefined): string | null => {
  if (start_date && end_date) {
    if (new Date(end_date) < new Date(start_date)) {
      return 'End Date cannot be earlier than Start Date';
    }
  }
  return null;
};

// GET /api/batches
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { course_id } = req.query;
    let q = `SELECT b.*, c.course_name, cc.category_name,
      (SELECT COUNT(*) FROM students s WHERE s.batch_id = b.id AND s.status != 'discontinued') as student_count
      FROM batches b
      LEFT JOIN courses c ON c.id = b.course_id
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      WHERE 1=1`;
    const params: unknown[] = [];
    if (course_id) { params.push(course_id); q += ` AND b.course_id=$${params.length}`; }
    q += ' ORDER BY b.created_at DESC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /batches error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/batches
router.post('/', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { batch_name, course_id, start_date, end_date, status } = req.body;
    if (!batch_name || !String(batch_name).trim()) {
      res.status(400).json({ success: false, message: 'Batch name is required' });
      return;
    }
    if (!course_id) {
      res.status(400).json({ success: false, message: 'Course is required' });
      return;
    }
    const dateError = validateDates(start_date, end_date);
    if (dateError) {
      res.status(400).json({ success: false, message: dateError });
      return;
    }
    const result = await query(
      `INSERT INTO batches (batch_name, course_id, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [String(batch_name).trim(), course_id, start_date || null, end_date || null, status || 'active']
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /batches error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/batches/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT b.*, c.course_name, cc.category_name FROM batches b
       LEFT JOIN courses c ON c.id = b.course_id
       LEFT JOIN course_categories cc ON cc.id = c.category_id
       WHERE b.id=$1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Batch not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /batches/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/batches/:id
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { batch_name, course_id, start_date, end_date, status } = req.body;
    if (!batch_name || !String(batch_name).trim()) {
      res.status(400).json({ success: false, message: 'Batch name is required' });
      return;
    }
    const dateError = validateDates(start_date, end_date);
    if (dateError) {
      res.status(400).json({ success: false, message: dateError });
      return;
    }
    const result = await query(
      `UPDATE batches SET batch_name=$1, course_id=$2, start_date=$3, end_date=$4, status=$5 WHERE id=$6 RETURNING *`,
      [String(batch_name).trim(), course_id, start_date || null, end_date || null, status || 'active', req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Batch not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /batches/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/batches/:id
router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM batches WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Batch deleted' });
  } catch (err) {
    console.error('DELETE /batches/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
