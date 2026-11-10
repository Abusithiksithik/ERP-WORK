import path from 'path';
import fs from 'fs';

/** Keep large files outside the checked-out project directory by default.
 * Override STORAGE_ROOT with a persistent mounted volume in production. */
export const STORAGE_ROOT = path.resolve(
  process.env.STORAGE_ROOT || path.join(process.cwd(), '..', '..', 'epff-storage')
);

export function ensureStorageDir(folder: string): string {
  const dir = path.join(STORAGE_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function makeStoredFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}
