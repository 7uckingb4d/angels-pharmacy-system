// Express app (no listen) — used by server.js locally and api/index.js on Vercel.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

import authRoutes from './routes/auth.js';
import medicinesRoutes from './routes/medicines.js';
import ordersRoutes from './routes/orders.js';
import prescriptionsRoutes from './routes/prescriptions.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import { supabaseAdmin, config as dbConfig } from './config/supabase.js';
import { diagnoseDbError } from './lib/helpers.js';

const app = express();
app.set('trust proxy', 1); // Vercel sits behind a proxy; needed for correct client IPs.

app.use(helmet({
  contentSecurityPolicy: false,          // pages use inline scripts/handlers
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Frontend is served from the same origin, so CORS is only needed for extra origins.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
if (allowedOrigins.length) app.use('/api', cors({ origin: allowedOrigins, credentials: true }));

const limiter = (windowMs, limit, message) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: message } });

app.use('/api', limiter(15 * 60 * 1000, 600, 'Too many requests. Please try again later.'));
app.use('/api/auth/login', limiter(15 * 60 * 1000, 20, 'Too many login attempts. Please wait 15 minutes.'));
app.use('/api/auth/password', limiter(15 * 60 * 1000, 10, 'Too many password attempts. Please wait 15 minutes.'));
app.use('/api/auth/signup', limiter(60 * 60 * 1000, 20, 'Too many sign-ups from this network. Try again later.'));
app.post('/api/admin/contacts', limiter(60 * 60 * 1000, 10, 'Too many messages. Please try again later.'));

app.use(express.json({ limit: '1mb' }));

// Health + database self-check. Open /api/health in a browser to see what is wrong (no secrets shown).
app.get('/api/health', async (_req, res) => {
  const config = {
    supabase_url_ok: dbConfig.urlLooksValid,
    secret_key_type: dbConfig.secretKind,          // should be "secret" or "legacy-service_role"
    publishable_key_type: dbConfig.publishableKind, // should be "publishable" or "legacy-anon"
  };
  const problems = [];
  if (!dbConfig.urlLooksValid) problems.push('SUPABASE_URL should look like https://<project-ref>.supabase.co');
  if (!['secret', 'legacy-service_role'].includes(dbConfig.secretKind)) {
    problems.push('SUPABASE_SECRET_KEY is not a secret/service_role key (it looks like: ' + dbConfig.secretKind + ').');
  }

  const checks = {};
  for (const table of ['Category', 'Product', 'Profiles']) {
    try {
      const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
      checks[table] = error ? { ok: false, code: error.code || null, fix: diagnoseDbError(error) } : { ok: true, rows: count ?? 0 };
    } catch (e) {
      checks[table] = { ok: false, code: null, fix: diagnoseDbError(e) };
    }
  }
  const dbOk = Object.values(checks).every(c => c.ok);
  if (dbOk && checks.Product.rows === 0) problems.push('No medicines yet — add some in the admin panel.');

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'database_error',
    project: "Angel's Pharmacy",
    time: new Date().toISOString(),
    config,
    database: checks,
    problems,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicinesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/prescriptions', prescriptionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Route not found.' }));

// Static site (Vercel serves /public from its CDN; this is for local `npm run dev`).
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.use(express.static(publicDir));
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.use((_req, res) => res.status(404).sendFile(path.join(publicDir, 'index.html')));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (4 MB max).' : err.message;
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message });
  }
  if (err.code === 'INVALID_FILE_TYPE') return res.status(400).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

export default app;
