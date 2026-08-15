import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { uploadMaterial } from '../middleware/upload';
import path from 'path';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { course_id, module_id, category_id } = req.query;
    let q = `SELECT mt.*, c.course_name, cc.category_name, lm.module_name, lm.order_number as module_order
             FROM lms_materials mt
             LEFT JOIN courses c ON c.id = mt.course_id
             LEFT JOIN course_categories cc ON cc.id = c.category_id
             LEFT JOIN lms_modules lm ON lm.id = mt.module_id
             WHERE 1=1`;
    const params: unknown[] = [];
    if (category_id) { params.push(category_id); q += ` AND c.category_id=$${params.length}`; }
    if (course_id) { params.push(course_id); q += ` AND mt.course_id=$${params.length}`; }
    if (module_id) { params.push(module_id); q += ` AND mt.module_id=$${params.length}`; }
    q += ' ORDER BY mt.course_id ASC, lm.order_number ASC NULLS LAST, mt.created_at DESC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error('GET /materials error:', err); res.status(500).json({ success: false, message: 'Server error' }); }
});


router.post('/', authorize('super_admin', 'admin', 'faculty'), uploadMaterial.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { course_id, module_id, title, description, is_free } = req.body;
    if (!course_id || !title || !req.file) { res.status(400).json({ success: false, message: 'course_id, title and file required' }); return; }
    const ext = path.extname(req.file.originalname).replace('.', '').toLowerCase();
    const fileTypeMap: { [key: string]: string } = { pdf: 'pdf', ppt: 'ppt', pptx: 'ppt', doc: 'docx', docx: 'docx', zip: 'zip' };
    const file_type = fileTypeMap[ext] || 'other';
    const file_url = `/uploads/materials/${req.file.filename}`;
    const result = await query(
      `INSERT INTO lms_materials (course_id, module_id, title, description, file_url, file_type, is_free, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [course_id, module_id || null, title, description || null, file_url, file_type, is_free === 'true' || is_free === true, req.user!.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT * FROM lms_materials WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/:id', authorize('super_admin', 'admin', 'faculty'), uploadMaterial.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query('SELECT * FROM lms_materials WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    const { title, description, module_id, is_free } = req.body;
    const file_url = req.file ? `/uploads/materials/${req.file.filename}` : existing.rows[0].file_url;
    const file_type = req.file ? path.extname(req.file.originalname).replace('.', '').toLowerCase() : existing.rows[0].file_type;
    const result = await query(
      `UPDATE lms_materials SET title=$1, description=$2, module_id=$3, file_url=$4, file_type=$5, is_free=$6 WHERE id=$7 RETURNING *`,
      [title, description || null, module_id || null, file_url, file_type, is_free === 'true' || is_free === true, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM lms_materials WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Material deleted' });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;
