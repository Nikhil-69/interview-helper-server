import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import aiRoutes from './routes/ai.js';
import creditRoutes from './routes/credits.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' })); // screenshots arrive as base64 data URLs

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

// Admin SPA (built by `npm run admin:build`)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDist = path.join(__dirname, '..', 'admin', 'dist');
app.use('/admin', express.static(adminDist));
app.get('/admin/{*splat}', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`interview-helper-server listening on http://localhost:${config.port}`);
  console.log(`admin panel at http://localhost:${config.port}/admin`);
});
