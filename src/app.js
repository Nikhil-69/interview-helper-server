import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.js';
import aiRoutes from './routes/ai.js';
import creditRoutes from './routes/credits.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(cors());
// screenshots arrive as base64 data URLs (Vercel caps bodies at ~4.5mb — the app compresses images client-side).
// rawBody is kept because Razorpay webhook signatures are HMACs of the raw request bytes.
app.use(express.json({
  limit: '25mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Serverless invocations must establish (or reuse) the DB connection lazily.
app.use((_req, _res, next) => {
  connectDB().then(() => next(), next);
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

// Admin SPA (built by `npm run admin:build` into public/admin).
// On Vercel these files are served from the static layer instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDist = path.join(__dirname, '..', 'public', 'admin');
app.use('/admin', express.static(adminDist));
app.get('/admin/{*splat}', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
