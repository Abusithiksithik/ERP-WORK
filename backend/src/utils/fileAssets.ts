import { query } from '../config/db';

export interface StoredAsset {
  id: number;
  url: string;
}

/** Persist a small image/document in PostgreSQL. Assets intentionally have no
 * FK to students/users so deleting an application record cannot cascade-delete it. */
export async function storeAsset(file: Express.Multer.File, category: string): Promise<StoredAsset> {
  const result = await query(
    `INSERT INTO file_assets (category, original_name, mime_type, file_size, data)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [category, file.originalname, file.mimetype, file.size, file.buffer]
  );
  const id = Number(result.rows[0].id);
  return { id, url: `/api/files/${id}` };
}
