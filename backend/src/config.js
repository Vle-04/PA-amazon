import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load backend/.env when present. Variables already set in the environment win.
const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
// Built frontend served by this process (NFR-1).
export const FRONTEND_DIST = path.resolve(process.env.FRONTEND_DIST || path.join(ROOT, '..', 'frontend', 'dist'));
export const DB_PATH = path.join(DATA_DIR, 'shuka.db');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
export const PORT = Number(process.env.PORT || 3000);
export const IS_PROD = process.env.NODE_ENV === 'production';
export const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PROD ? null : 'dev-only-insecure-secret');
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Email (SMTP). Without SMTP_HOST, emails are printed to the server console instead of sent.
export const SMTP = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
};
export const MAIL_FROM = process.env.MAIL_FROM || (SMTP.user ? `Shuka <${SMTP.user}>` : 'Shuka <no-reply@shuka.local>');
// Public site address used in email links, e.g. https://shuka.fly.dev (falls back to the request host).
export const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
// Lets the break-it tests receive the verification code in the API response (header x-test-token).
// Disabled in production unless TEST_AUTH_TOKEN is set.
export const TEST_AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || (IS_PROD ? '' : 'dev-test-token');
