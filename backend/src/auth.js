import crypto from 'node:crypto';
import { SESSION_SECRET, IS_PROD } from './config.js';
import { getDb } from './db.js';
import { unauthorized, forbidden } from './errors.js';

export const COOKIE = 'shuka_session';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

const sign = (payload) => crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');

export function setSession(res, userId) {
  const payload = `${userId}.${Date.now() + MAX_AGE_MS}`;
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: MAX_AGE_MS, path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, path: '/' });
}

function readSession(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return Number(parts[0]);
}

/** Attaches req.user (or null) on every request. */
export function loadUser(req, _res, next) {
  const id = readSession(req.cookies?.[COOKIE]);
  req.user = id
    ? getDb().prepare('SELECT id, email, name, phone, is_seller, store_name, store_phone FROM users WHERE id = ? AND email_verified = 1').get(id) || null
    : null;
  next();
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireSeller(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.is_seller) return next(forbidden('Become a seller first'));
  next();
}

export const publicUser = (u) => u && ({
  id: u.id, email: u.email, name: u.name, phone: u.phone,
  isSeller: !!u.is_seller, storeName: u.store_name, storePhone: u.store_phone,
});
