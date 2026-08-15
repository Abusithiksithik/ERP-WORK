import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const createStorage = (folder: string) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(__dirname, '../../uploads', folder);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  });

const imageFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const videoFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowed = /mp4|mkv|avi|mov|webm/;
  if (allowed.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only video files are allowed'));
  }
};

const materialFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowed = /pdf|ppt|pptx|doc|docx|zip/;
  if (allowed.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, PPT, DOC, ZIP files allowed'));
  }
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const uploadPhoto = multer({ storage: createStorage('photos'), fileFilter: imageFilter, limits: { fileSize: 5 * MB } });
export const uploadThumbnail = multer({ storage: createStorage('thumbnails'), fileFilter: imageFilter, limits: { fileSize: 5 * MB } });
export const uploadQR = multer({ storage: createStorage('qr'), fileFilter: imageFilter, limits: { fileSize: 5 * MB } });
export const uploadVideo = multer({ storage: createStorage('videos'), fileFilter: videoFilter, limits: { fileSize: 5 * GB } });
export const uploadMaterial = multer({ storage: createStorage('materials'), fileFilter: materialFilter, limits: { fileSize: 50 * MB } });

export const uploadVideoWithThumb = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      const folder = file.fieldname === 'video' ? 'videos' : 'thumbnails';
      const dir = path.join(__dirname, '../../uploads', folder);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  // ✅ 5GB max video upload
  limits: { fileSize: 5 * GB },
});
