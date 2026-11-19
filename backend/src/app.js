import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { FRONTEND_DIST, UPLOADS_DIR, TRUST_PROXY, ALLOWED_ORIGIN_HOSTS } from './config.js';
import { loadUser } from './auth.js';
import { errorHandler, notFound } from './errors.js';
import account from './routes/account.js';
import catalog from './routes/catalog.js';
import cart from './routes/cart.js';
import orders from './routes/orders.js';
import seller from './routes/seller.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', TRUST_PROXY);
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/', (req, res, next) => (fs.existsSync(FRONTEND_DIST) ? next() : res.json({ name: 'Shuka API', health: '/healthz', api: '/api' })));
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

  const api = express.Router();
  // API answers are per-user: never let a CDN or proxy (e.g. Netlify) cache them.
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());
  api.use(loadUser);
  // CSRF defence in depth on top of SameSite=Lax: state-changing requests must be same-origin.
  api.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    let host = null;
    try { host = origin ? new URL(origin).host : null; } catch { /* malformed */ }
    if (origin && host !== req.get('host') && !ALLOWED_ORIGIN_HOSTS.has(host)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cross-site request blocked' } });
    }
    next();
  });
  api.use(account, catalog, cart, orders, seller);
  api.use((req, res, next) => next(notFound('No such API endpoint')));
  api.use(errorHandler);
  app.use('/api', api);

  // Serve the built frontend (single process, NFR-1).
  const dist = FRONTEND_DIST;
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
