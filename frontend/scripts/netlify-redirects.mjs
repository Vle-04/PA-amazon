// Netlify: writes dist/_redirects so the site proxies the API and images to the backend on Render.
// The browser only talks to the Netlify domain, so the login cookie stays first-party (no CORS).
// Set BACKEND_URL in Netlify → Site configuration → Environment variables, e.g. https://shuka-api.onrender.com
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raw = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
if (!/^https?:\/\/[^/\s]+$/.test(raw)) {
  console.error('BACKEND_URL must be set to the backend address, e.g. https://shuka-api.onrender.com (no path, no trailing slash).');
  process.exit(1);
}
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const rules = [
  `/api/*      ${raw}/api/:splat      200!`,
  `/uploads/*  ${raw}/uploads/:splat  200!`,
  `/healthz    ${raw}/healthz         200!`,
  '/*          /index.html            200',
];
fs.writeFileSync(path.join(dist, '_redirects'), rules.join('\n') + '\n');
console.log(`Netlify redirects written: /api and /uploads → ${raw}`);
