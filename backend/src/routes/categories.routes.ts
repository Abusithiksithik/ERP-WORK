import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/categories
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT cc.*,
        (SELECT COUNT(*) FROM courses c WHERE c.category_id = cc.id) AS course_count
      FROM course_categories cc
      ORDER BY cc.category_name ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /categories error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/categories
router.post('/', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { category_name, description, status } = req.body;
    if (!category_name || !String(category_name).trim()) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }
    const name = String(category_name).trim();
    if (name.length < 2 || name.length > 200) {
      res.status(400).json({ success: false, message: 'Category name must be 2–200 characters' });
      return;
    }
    // Check duplicate name
    const dup = await query('SELECT id FROM course_categories WHERE LOWER(category_name)=LOWER($1)', [name]);
    if (dup.rows.length > 0) {
      res.status(409).json({ success: false, message: 'A category with this name already exists' });
      return;
    }
    const result = await query(
      `INSERT INTO course_categories (category_name, description, status, created_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, description?.trim() || null, status || 'active', req.user!.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /categories error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/categories/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT cc.*,
        (SELECT COUNT(*) FROM courses c WHERE c.category_id = cc.id) AS course_count
       FROM course_categories cc WHERE cc.id=$1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /categories/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/categories/:id
router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { category_name, description, status } = req.body;
    if (!category_name || !String(category_name).trim()) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }
    const name = String(category_name).trim();
    if (name.length < 2 || name.length > 200) {
      res.status(400).json({ success: false, message: 'Category name must be 2–200 characters' });
      return;
    }
    // Check for duplicate name excluding self
    const dup = await query(
      'SELECT id FROM course_categories WHERE LOWER(category_name)=LOWER($1) AND id!=$2',
      [name, req.params.id]
    );
    if (dup.rows.length > 0) {
      res.status(409).json({ success: false, message: 'A category with this name already exists' });
      return;
    }
    const result = await query(
      `UPDATE course_categories SET category_name=$1, description=$2, status=$3
       WHERE id=$4 RETURNING *`,
      [name, description?.trim() || null, status || 'active', req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /categories/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    // Check if courses are using this category
    const courseCheck = await query(
      'SELECT COUNT(*) FROM courses WHERE category_id=$1', [req.params.id]
    );
    if (parseInt(courseCheck.rows[0].count) > 0) {
      res.status(409).json({
        success: false,
        message: `Cannot delete: ${courseCheck.rows[0].count} course(s) are assigned to this category. Reassign or delete courses first.`
      });
      return;
    }
    const result = await query('DELETE FROM course_categories WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (err) {
    console.error('DELETE /categories/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/categories/:id/status — toggle active/inactive
router.patch('/:id/status', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query('SELECT status FROM course_categories WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    const newStatus = existing.rows[0].status === 'active' ? 'inactive' : 'active';
    const result = await query(
      'UPDATE course_categories SET status=$1 WHERE id=$2 RETURNING *',
      [newStatus, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PATCH /categories/:id/status error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
