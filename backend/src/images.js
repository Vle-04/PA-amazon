import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { UPLOADS_DIR } from './config.js';
import { HttpError } from './errors.js';

const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif']);
export const UPLOAD_KEY_RE = /^[a-f0-9]{32}$/;

/** NFR-3: check by content (not name or Content-Type), resize to thumb + large, store as files. */
export async function processImage(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    meta = null;
  }
  if (!meta || !ALLOWED.has(meta.format)) {
    throw new HttpError(400, 'INVALID_IMAGE', 'This file is not a supported image. Use JPEG, PNG, WebP, GIF or HEIC.');
  }
  const key = crypto.randomBytes(16).toString('hex');
  const base = sharp(buffer, { limitInputPixels: 50_000_000 }).rotate();
  try {
    await Promise.all([
      base.clone().resize(400, 400, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(UPLOADS_DIR, `${key}_thumb.webp`)),
      base.clone().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(UPLOADS_DIR, `${key}_large.webp`)),
    ]);
  } catch {
    throw new HttpError(400, 'INVALID_IMAGE', 'The image could not be read. It may be damaged.');
  }
  return imagePaths(key);
}

export const imagePaths = (key) => ({ key, thumb: `/uploads/${key}_thumb.webp`, large: `/uploads/${key}_large.webp` });

export async function uploadExists(key) {
  if (!UPLOAD_KEY_RE.test(key)) return false;
  try {
    await fs.access(path.join(UPLOADS_DIR, `${key}_large.webp`));
    await fs.access(path.join(UPLOADS_DIR, `${key}_thumb.webp`));
    return true;
  } catch {
    return false;
  }
}
