import { Router, Request, Response } from 'express';
import { query } from '../config/db';

const router = Router();

// Public read endpoint to preserve normal <img> and document preview behavior.
// Only binary assets intended for display/download are exposed; never returns metadata or SQL.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      res.status(400).end();
      return;
    }
    const result = await query(
      'SELECT mime_type, original_name, data FROM file_assets WHERE id=$1',
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).end();
      return;
    }
    const asset = result.rows[0];
    res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(asset.original_name || 'file')}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(asset.data);
  } catch (error) {
    console.error('GET /api/files/:id failed', error);
    res.status(500).end();
  }
});

export default router;
