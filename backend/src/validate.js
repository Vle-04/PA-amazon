import { badRequest } from './errors.js';

export const REGIONS = ['Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik', 'Kotayk', 'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor'];
export const PHONE_RE = /^\+?[0-9 ()-]{6,20}$/;

/**
 * Tiny validator. rules: { field: [check, ...] }, each check returns an error message or null.
 * Throws 400 with { fields: { name: message } } so the UI can show messages next to each field.
 */
export function validate(body, rules) {
  const src = body && typeof body === 'object' ? body : {};
  const out = {};
  const fields = {};
  for (const [key, checks] of Object.entries(rules)) {
    let v = src[key];
    if (typeof v === 'string') v = v.trim();
    for (const check of checks) {
      const r = check(v);
      if (r && typeof r === 'object' && 'value' in r) { v = r.value; continue; }
      if (r) { fields[key] = r; break; }
    }
    if (!fields[key] && v !== undefined) out[key] = v;
  }
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields', fields);
  return out;
}

const empty = (v) => v === undefined || v === null || v === '';
export const required = (label = 'This field') => (v) => (empty(v) ? `${label} is required` : null);
export const optional = (fallback) => (v) => (empty(v) ? { value: fallback } : null);
export const str = (min, max) => (v) => {
  if (v === undefined) return null;
  if (typeof v !== 'string') return 'Must be text';
  if (v.length < min) return `Must be at least ${min} characters`;
  if (v.length > max) return `Must be at most ${max} characters`;
  return null;
};
export const int = (min, max) => (v) => {
  if (v === undefined) return null;
  const n = typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n)) return 'Must be a whole number';
  if (n < min) return `Must be at least ${min}`;
  if (n > max) return `Must be at most ${max}`;
  return { value: n };
};
export const email = () => (v) => (v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Enter a valid email');
export const phone = () => (v) => (empty(v) || PHONE_RE.test(v) ? null : 'Enter a valid phone, e.g. +374 91 123456');
export const oneOf = (list) => (v) => (v === undefined || list.includes(v) ? null : `Must be one of: ${list.join(', ')}`);
export const bool = () => (v) => (v === undefined || typeof v === 'boolean' ? null : 'Must be true or false');

/** Parse a positive integer path id; anything else is a 404 rather than leaking errors. */
export function idParam(v) {
  return /^\d{1,15}$/.test(String(v)) ? Number(v) : null;
}
