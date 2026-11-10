/* One-time, non-destructive migration of existing local photos/certificates/video thumbnails.
 * Run from backend after setting DB_NAME=epff and creating file_assets via migrate_v26_file_assets.sql.
 * Source files are NEVER deleted. Missing source files are reported and left unchanged.
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'epff',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '12345',
});
const uploadsRoot = path.resolve(__dirname, '../uploads');
const mappings = [
  ['students', 'id', 'photo_url', 'student_photo'],
  ['students', 'id', 'cert_10th_url', 'student_certificate_10th'],
  ['students', 'id', 'cert_12th_url', 'student_certificate_12th'],
  ['students', 'id', 'cert_diploma_url', 'student_certificate_diploma'],
  ['users', 'id', 'photo_url', 'user_profile_photo'],
  ['lms_videos', 'id', 'thumbnail_url', 'lms_video_thumbnail'],
];

(async () => {
  let migrated = 0, missing = 0, skipped = 0;
  try {
    await pool.query('SELECT 1 FROM file_assets LIMIT 1');
    for (const [table, idCol, urlCol, category] of mappings) {
      const rows = await pool.query(`SELECT ${idCol} AS id, ${urlCol} AS url FROM ${table} WHERE ${urlCol} IS NOT NULL AND ${urlCol} <> ''`);
      for (const row of rows.rows) {
        if (row.url.startsWith('/api/files/')) { skipped++; continue; }
        const relative = row.url.replace(/^\/+uploads\//, '').replace(/^uploads\//, '');
        if (relative === row.url || relative.includes('..')) { skipped++; continue; }
        const source = path.resolve(uploadsRoot, relative);
        if (!source.startsWith(uploadsRoot + path.sep) || !fs.existsSync(source)) {
          console.warn(`MISSING: ${table}.${urlCol} id=${row.id} path=${row.url}`);
          missing++; continue;
        }
        const data = fs.readFileSync(source);
        const ext = path.extname(source).toLowerCase();
        const mime = ({ '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.gif':'image/gif', '.webp':'image/webp', '.pdf':'application/pdf' })[ext] || 'application/octet-stream';
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const inserted = await client.query(
            'INSERT INTO file_assets(category, original_name, mime_type, file_size, data) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [category, path.basename(source), mime, data.length, data]
          );
          await client.query(`UPDATE ${table} SET ${urlCol}=$1 WHERE ${idCol}=$2`, [`/api/files/${inserted.rows[0].id}`, row.id]);
          await client.query('COMMIT');
          migrated++;
          console.log(`MIGRATED: ${table}.${urlCol} id=${row.id}`);
        } catch (e) { await client.query('ROLLBACK'); throw e; }
        finally { client.release(); }
      }
    }
    console.log(`Finished. migrated=${migrated}, missing=${missing}, skipped=${skipped}. Original files were retained.`);
    if (missing) process.exitCode = 2;
  } catch (e) {
    console.error('Migration failed. Existing files were not deleted.', e);
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
