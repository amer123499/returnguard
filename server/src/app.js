import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import ordersRouter from './routes/orders.js';
import returnsRouter from './routes/returns.js';
import dashboardRouter from './routes/dashboard.js';
import metaRouter from './routes/meta.js';

// Host names the API answers to. Blocks DNS-rebinding attacks, where a malicious
// website points its own domain at 127.0.0.1 to reach this API.
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

// The web app reaches the API through the Vite proxy (same origin), so no
// cross-origin access is needed. Set CORS_ORIGINS only for a separately hosted UI.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);

function hostName(hostHeader = '') {
  const h = hostHeader.toLowerCase();
  return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
}

export function createApp(db = pool) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    if (!ALLOWED_HOSTS.includes(hostName(req.headers.host))) {
      return res.status(403).json({ error: 'Host not allowed.' });
    }
    // Responses contain customer details: never cache them, never sniff types.
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  if (CORS_ORIGINS.length) app.use(cors({ origin: CORS_ORIGINS }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res, next) => {
    try {
      await db.query('SELECT 1');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/meta', metaRouter());
  app.use('/api/orders', ordersRouter(db));
  app.use('/api/returns', returnsRouter(db));
  app.use('/api/dashboard', dashboardRouter(db));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message,
    });
  });

  return app;
}
