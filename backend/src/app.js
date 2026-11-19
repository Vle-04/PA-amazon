import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { FRONTEND_DIST, UPLOADS_DIR } from './config.js';
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
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());
  api.use(loadUser);
  // CSRF defence in depth on top of SameSite=Lax: state-changing requests must be same-origin.
  api.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) {
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
