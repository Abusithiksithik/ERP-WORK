import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { course_id, category_id } = req.query;
    let q = `SELECT m.*, c.course_name, cc.category_name
             FROM lms_modules m
             LEFT JOIN courses c ON c.id = m.course_id
             LEFT JOIN course_categories cc ON cc.id = c.category_id
             WHERE 1=1`;
    const params: unknown[] = [];
    if (category_id) { params.push(category_id); q += ` AND c.category_id=$${params.length}`; }
    if (course_id) { params.push(course_id); q += ` AND m.course_id=$${params.length}`; }
    q += ' ORDER BY m.course_id ASC, m.order_number ASC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error('GET /modules error:', err); res.status(500).json({ success: false, message: 'Server error' }); }
});


router.post('/', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { course_id, module_name, order_number, status } = req.body;
    if (!course_id || !module_name) { res.status(400).json({ success: false, message: 'course_id and module_name required' }); return; }
    const result = await query(
      `INSERT INTO lms_modules (course_id, module_name, order_number, status) VALUES ($1,$2,$3,$4) RETURNING *`,
      [course_id, module_name, order_number || 1, status || 'active']
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { module_name, order_number, status } = req.body;
    const result = await query(
      `UPDATE lms_modules SET module_name=$1, order_number=$2, status=$3 WHERE id=$4 RETURNING *`,
      [module_name, order_number || 1, status || 'active', req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM lms_modules WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Module deleted' });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;
