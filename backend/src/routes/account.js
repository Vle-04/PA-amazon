import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, now } from '../db.js';
import { setSession, clearSession, requireUser, publicUser } from '../auth.js';
import { HttpError, conflict } from '../errors.js';
import { validate, required, optional, str, email, phone } from '../validate.js';
import { APP_URL, SESSION_SECRET, TEST_AUTH_TOKEN } from '../config.js';
import { sendMail, verificationEmail } from '../mail.js';

const r = Router();

const CODE_TTL_MS = 15 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

const isTestClient = (req) => !!TEST_AUTH_TOKEN && req.get('x-test-token') === TEST_AUTH_TOKEN;
const codeHash = (userId, code) => crypto.createHmac('sha256', SESSION_SECRET || 'unset').update(`${userId}:${code}`).digest('hex');

// Small in-memory limiter so the email endpoints cannot be used to spam inboxes.
const hits = new Map();
function limit(req, key, max, windowMs) {
  if (isTestClient(req)) return;
  const k = `${key}:${req.ip}`;
  const t = Date.now();
  const list = (hits.get(k) || []).filter((x) => t - x < windowMs);
  if (list.length >= max) throw conflict('TOO_MANY_REQUESTS', 'Too many attempts. Please wait a few minutes and try again.');
  list.push(t);
  hits.set(k, list);
  if (hits.size > 10_000) hits.clear();
}

/** Creates a fresh code, stores its hash, and emails it. The email is sent after the DB write, outside any transaction. */
async function issueCode(req, user) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const ts = Date.now();
  getDb().prepare('UPDATE users SET verify_code_hash = ?, verify_expires_at = ?, verify_attempts = 0, verify_sent_at = ? WHERE id = ?')
    .run(codeHash(user.id, code), new Date(ts + CODE_TTL_MS).toISOString(), new Date(ts).toISOString(), user.id);
  if (isTestClient(req)) return { emailSent: true, testCode: code };
  const base = APP_URL || `${req.protocol}://${req.get('host')}`;
  const link = `${base}/verify-email?email=${encodeURIComponent(user.email)}&code=${code}`;
  const emailSent = await sendMail({ to: user.email, ...verificationEmail({ name: user.name, code, link }) });
  return { emailSent };
}

const canResend = (user) => !user.verify_sent_at || Date.now() - Date.parse(user.verify_sent_at) >= RESEND_COOLDOWN_MS;

r.post('/auth/register', async (req, res) => {
  limit(req, 'register', 10, 15 * 60_000);
  const b = validate(req.body, {
    email: [required('Email'), str(3, 200), email()],
    password: [required('Password'), str(8, 200)],
    name: [required('Name'), str(1, 100)],
    phone: [optional(''), str(0, 30), phone()],
  });
  const db = getDb();
  const emailLc = b.email.toLowerCase();
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(emailLc);
  if (existing?.email_verified) {
    throw conflict('EMAIL_TAKEN', 'An account with this email already exists', { fields: { email: 'This email is already registered. Sign in instead.' } });
  }
  const hash = await bcrypt.hash(b.password, 10);
  let user;
  if (existing) {
    // Unverified sign-up again (e.g. a typo or lost email): only the inbox owner can finish it.
    db.prepare('UPDATE users SET password_hash = ?, name = ?, phone = ? WHERE id = ?').run(hash, b.name, b.phone, existing.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
  } else {
    try {
      const id = db.prepare('INSERT INTO users (email, password_hash, name, phone, created_at) VALUES (?,?,?,?,?)')
        .run(emailLc, hash, b.name, b.phone, now()).lastInsertRowid;
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('EMAIL_TAKEN', 'An account with this email already exists', { fields: { email: 'This email is already registered' } });
      throw e;
    }
  }
  const sent = existing && !canResend(existing) ? { emailSent: true } : await issueCode(req, user);
  res.status(201).json({ pendingVerification: true, email: user.email, ...sent });
});

r.post('/auth/verify-email', (req, res) => {
  limit(req, 'verify', 30, 15 * 60_000);
  const b = validate(req.body, { email: [required('Email'), str(3, 200)], code: [required('Code'), str(1, 20)] });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(b.email.toLowerCase());
  const bad = (message, code = 'INVALID_CODE') => new HttpError(400, code, message, { fields: { code: message } });
  if (!user) throw bad('This code is not valid');
  if (user.email_verified) {
    setSession(res, user.id);
    return res.json({ user: publicUser(user), alreadyVerified: true });
  }
  if (!user.verify_code_hash) throw bad('Request a new code', 'CODE_EXPIRED');
  if (user.verify_attempts >= MAX_ATTEMPTS) throw bad('Too many wrong codes. Request a new code.', 'TOO_MANY_ATTEMPTS');
  if (Date.parse(user.verify_expires_at) < Date.now()) throw bad('This code has expired. Request a new code.', 'CODE_EXPIRED');
  const given = Buffer.from(codeHash(user.id, String(b.code).replace(/\s/g, '')));
  const expected = Buffer.from(user.verify_code_hash);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    db.prepare('UPDATE users SET verify_attempts = verify_attempts + 1 WHERE id = ?').run(user.id);
    const left = MAX_ATTEMPTS - user.verify_attempts - 1;
    throw bad(left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Request a new code.');
  }
  db.prepare('UPDATE users SET email_verified = 1, verify_code_hash = NULL, verify_expires_at = NULL, verify_attempts = 0 WHERE id = ?').run(user.id);
  setSession(res, user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
});

r.post('/auth/resend-verification', async (req, res) => {
  limit(req, 'resend', 5, 15 * 60_000);
  const b = validate(req.body, { email: [required('Email'), str(3, 200)] });
  const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(b.email.toLowerCase());
  // Same answer whether or not the account exists, so this cannot be used to probe emails.
  if (!user || user.email_verified) return res.json({ ok: true });
  if (!canResend(user)) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - Date.parse(user.verify_sent_at))) / 1000);
    throw conflict('TOO_SOON', `Please wait ${wait} seconds before requesting another code`, { retryAfter: wait });
  }
  const sent = await issueCode(req, user);
  res.json({ ok: true, ...sent });
});

r.post('/auth/login', async (req, res) => {
  limit(req, 'login', 20, 15 * 60_000);
  const b = validate(req.body, { email: [required('Email'), str(1, 200)], password: [required('Password'), str(1, 200)] });
  const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(b.email.toLowerCase());
  // Compare against a dummy hash when the user is unknown to keep timing similar.
  const ok = await bcrypt.compare(b.password, user?.password_hash || '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.uY2lYcqzGqSZ5nE5o7SHo1v6W4mS');
  if (!user || !ok) throw new HttpError(401, 'BAD_CREDENTIALS', 'Wrong email or password');
  if (!user.email_verified) {
    const sent = canResend(user) ? await issueCode(req, user) : {};
    throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Please confirm your email first. We sent you a code.', { email: user.email, ...sent });
  }
  setSession(res, user.id);
  res.json({ user: publicUser(user) });
});

r.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.status(204).end();
});

r.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));

r.patch('/me', requireUser, (req, res) => {
  const b = validate(req.body, {
    name: [required('Name'), str(1, 100)],
    phone: [optional(''), str(0, 30), phone()],
  });
  const db = getDb();
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(b.name, b.phone, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

/** FR-7: become a seller (or update store details), active at once. */
r.post('/me/seller', requireUser, (req, res) => {
  const b = validate(req.body, {
    storeName: [required('Store name'), str(2, 80)],
    storePhone: [required('Store phone'), str(6, 30), phone()],
  });
  const db = getDb();
  db.prepare('UPDATE users SET is_seller = 1, store_name = ?, store_phone = ? WHERE id = ?').run(b.storeName, b.storePhone, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});


export default r;
