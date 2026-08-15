import { Router, Response } from 'express';
import { query } from '../config/db';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { uploadQR } from '../middleware/upload';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT * FROM payment_methods ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/', authorize('super_admin', 'admin'), uploadQR.single('qr_image'), async (req: AuthRequest, res: Response) => {
  try {
    const { method_type, account_holder_name, bank_name, account_number, ifsc_code, upi_id } = req.body;
    if (!method_type) { res.status(400).json({ success: false, message: 'method_type required' }); return; }
    const qr_image_url = req.file ? `/uploads/qr/${req.file.filename}` : null;
    const result = await query(
      `INSERT INTO payment_methods (method_type, account_holder_name, bank_name, account_number, ifsc_code, upi_id, qr_image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [method_type, account_holder_name || null, bank_name || null, account_number || null, ifsc_code || null, upi_id || null, qr_image_url]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT * FROM payment_methods WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/:id', authorize('super_admin', 'admin'), uploadQR.single('qr_image'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query('SELECT * FROM payment_methods WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    const { method_type, account_holder_name, bank_name, account_number, ifsc_code, upi_id } = req.body;
    const qr_image_url = req.file ? `/uploads/qr/${req.file.filename}` : existing.rows[0].qr_image_url;
    const result = await query(
      `UPDATE payment_methods SET method_type=$1, account_holder_name=$2, bank_name=$3, account_number=$4,
       ifsc_code=$5, upi_id=$6, qr_image_url=$7 WHERE id=$8 RETURNING *`,
      [method_type, account_holder_name || null, bank_name || null, account_number || null, ifsc_code || null, upi_id || null, qr_image_url, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.delete('/:id', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM payment_methods WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Payment method deleted' });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.patch('/:id/toggle', authorize('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query('SELECT is_enabled FROM payment_methods WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    const result = await query('UPDATE payment_methods SET is_enabled=$1 WHERE id=$2 RETURNING *', [!existing.rows[0].is_enabled, req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

export default router;
