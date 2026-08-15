import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { uploadVideoWithThumb } from '../middleware/upload';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { course_id, module_id, category_id } = req.query;
    let q = `SELECT v.*, c.course_name, cc.category_name, m.module_name
             FROM lms_videos v
             LEFT JOIN courses c ON c.id = v.course_id
             LEFT JOIN course_categories cc ON cc.id = c.category_id
             LEFT JOIN lms_modules m ON m.id = v.module_id
             WHERE 1=1`;
    const params: unknown[] = [];
    if (category_id) { params.push(category_id); q += ` AND c.category_id=$${params.length}`; }
    if (course_id) { params.push(course_id); q += ` AND v.course_id=$${params.length}`; }
    if (module_id) { params.push(module_id); q += ` AND v.module_id=$${params.length}`; }
    q += ' ORDER BY v.course_id ASC, m.order_number ASC NULLS LAST, v.order_number ASC, v.created_at DESC';
    const result = await query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error('GET /videos error:', err); res.status(500).json({ success: false, message: 'Server error' }); }
});


router.post('/', authorize('super_admin', 'admin'), uploadVideoWithThumb.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req: AuthRequest, res: Response) => {
  try {
    const { course_id, module_id, title, description, is_free, order_number } = req.body;
    if (!course_id || !title) { res.status(400).json({ success: false, message: 'course_id and title required' }); return; }
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files?.video?.[0]) { res.status(400).json({ success: false, message: 'Video file required' }); return; }
    const video_url = `/uploads/videos/${files.video[0].filename}`;
    const thumbnail_url = files?.thumbnail?.[0] ? `/uploads/thumbnails/${files.thumbnail[0].filename}` : null;
    const result = await query(
      `INSERT INTO lms_videos (course_id, module_id, title, description, thumbnail_url, video_url, is_free, order_number, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [course_id, module_id || null, title, description || null, thumbnail_url, video_url,
       is_free === 'true' || is_free === true, order_number || 1, req.user!.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT v.*, c.course_name, m.module_name FROM lms_videos v
       LEFT JOIN courses c ON c.id = v.course_id
       LEFT JOIN lms_modules m ON m.id = v.module_id WHERE v.id=$1`, [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    const video = result.rows[0];
    // Check access for students
    if (req.user!.role === 'student' && !video.is_free) {
      const studentResult = await query('SELECT id FROM students WHERE user_id=$1', [req.user!.id]);
      if (studentResult.rows.length > 0) {
        const enrollment = await query(
          `SELECT e.id FROM enrollments e
           JOIN payments p ON p.enrollment_id = e.id
           WHERE e.student_id=$1 AND e.course_id=$2 AND e.status='approved' AND p.status='verified'`,
          [studentResult.rows[0].id, video.course_id]
        );
        if (enrollment.rows.length === 0) {
          res.status(403).json({ success: false, message: 'Payment required to access this video' });
          return;
        }
      }
    }
    res.json({ success: true, data: video });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/:id', authorize('super_admin', 'admin'), uploadVideoWithThumb.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query('SELECT * FROM lms_videos WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    const { title, description, is_free, order_number, module_id } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const video_url = files?.video?.[0] ? `/uploads/videos/${files.video[0].filename}` : existing.rows[0].video_url;
    const thumbnail_url = files?.thumbnail?.[0] ? `/uploads/thumbnails/${files.thumbnail[0].filename}` : existing.rows[0].thumbnail_url;
    const result = await query(
      `UPDATE lms_videos SET title=$1, description=$2, thumbnail_url=$3, video_url=$4, is_free=$5, order_number=$6, module_id=$7
       WHERE id=$8 RETURNING *`,
      [title, description || null, thumbnail_url, video_url, is_free === 'true' || is_free === true, order_number || 1, module_id || null, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM lms_videos WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Video deleted' });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.patch('/:id/publish', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query('SELECT is_published FROM lms_videos WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    const result = await query('UPDATE lms_videos SET is_published=$1 WHERE id=$2 RETURNING *', [!existing.rows[0].is_published, req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/:id/progress', authorize('student'), async (req: AuthRequest, res: Response) => {
  try {
    const { watched_seconds, is_completed } = req.body;
    const studentResult = await query('SELECT id FROM students WHERE user_id=$1', [req.user!.id]);
    if (studentResult.rows.length === 0) { res.status(404).json({ success: false, message: 'Student not found' }); return; }
    const student_id = studentResult.rows[0].id;
    await query(
      `INSERT INTO video_progress (student_id, video_id, watched_seconds, is_completed, last_watched_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (student_id, video_id) DO UPDATE SET watched_seconds=$3, is_completed=$4, last_watched_at=NOW()`,
      [student_id, req.params.id, watched_seconds || 0, is_completed || false]
    );
    res.json({ success: true, message: 'Progress saved' });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;
