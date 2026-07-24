import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { applyCreditChange } from '../services/creditService.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// ---- Users CRUD ----

router.get('/users', async (req, res) => {
  const search = req.query.q ? `%${req.query.q}%` : null;
  const params = [];
  let where = '';
  if (search) {
    where = 'WHERE email LIKE ? OR name LIKE ?';
    params.push(search, search);
  }
  const [rows] = await pool.query(
    `SELECT id, email, name, role, status, credits_balance, created_at
     FROM users ${where} ORDER BY id DESC LIMIT 200`,
    params
  );
  res.json({ users: rows });
});

router.post('/users', async (req, res) => {
  const { email, password, name = '', role = 'user', credits = 0 } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [email.toLowerCase().trim(), passwordHash, name, role === 'admin' ? 'admin' : 'user']
    );
    if (Number(credits) > 0) {
      await applyCreditChange(result.insertId, Number(credits), 'admin_adjustment', {
        description: 'Initial credits (admin-created account)',
      });
    }
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' });
    throw err;
  }
});

router.get('/users/:id', async (req, res) => {
  const [users] = await pool.query(
    'SELECT id, email, name, role, status, credits_balance, created_at FROM users WHERE id = ?',
    [req.params.id]
  );
  if (!users.length) return res.status(404).json({ error: 'User not found' });
  const [transactions] = await pool.query(
    'SELECT id, type, amount, balance_after, description, created_at FROM credit_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100',
    [req.params.id]
  );
  const [requests] = await pool.query(
    'SELECT id, request_type, model, credits_charged, status, error_message, created_at FROM ai_requests WHERE user_id = ? ORDER BY id DESC LIMIT 100',
    [req.params.id]
  );
  res.json({ user: users[0], transactions, requests });
});

router.patch('/users/:id', async (req, res) => {
  const allowed = {};
  if (req.body.name !== undefined) allowed.name = req.body.name;
  if (['active', 'blocked'].includes(req.body.status)) allowed.status = req.body.status;
  if (['user', 'admin'].includes(req.body.role)) allowed.role = req.body.role;
  if (req.body.password) allowed.password_hash = await bcrypt.hash(req.body.password, 10);
  if (!Object.keys(allowed).length) return res.status(400).json({ error: 'Nothing to update' });

  const [result] = await pool.query('UPDATE users SET ? WHERE id = ?', [allowed, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

router.delete('/users/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

// ---- Credit adjustment ----

router.post('/users/:id/credits', async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero integer (negative to deduct)' });
  }
  try {
    const { balance } = await applyCreditChange(Number(req.params.id), amount, 'admin_adjustment', {
      description: req.body?.reason || `Adjusted by ${req.user.email}`,
    });
    res.json({ credits: balance });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_CREDITS') {
      return res.status(400).json({ error: 'Adjustment would make balance negative' });
    }
    throw err;
  }
});

// ---- Packages CRUD ----

router.get('/packages', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM credit_packages ORDER BY credits');
  res.json({ packages: rows });
});

router.post('/packages', async (req, res) => {
  const { name, credits, price, currency = 'INR', isActive = true } = req.body || {};
  if (!name || !Number(credits) || price === undefined) {
    return res.status(400).json({ error: 'name, credits, price required' });
  }
  const [result] = await pool.query(
    'INSERT INTO credit_packages (name, credits, price, currency, is_active) VALUES (?, ?, ?, ?, ?)',
    [name, Number(credits), Number(price), currency, isActive ? 1 : 0]
  );
  res.status(201).json({ id: result.insertId });
});

router.patch('/packages/:id', async (req, res) => {
  const allowed = {};
  if (req.body.name !== undefined) allowed.name = req.body.name;
  if (req.body.credits !== undefined) allowed.credits = Number(req.body.credits);
  if (req.body.price !== undefined) allowed.price = Number(req.body.price);
  if (req.body.currency !== undefined) allowed.currency = req.body.currency;
  if (req.body.isActive !== undefined) allowed.is_active = req.body.isActive ? 1 : 0;
  if (!Object.keys(allowed).length) return res.status(400).json({ error: 'Nothing to update' });
  const [result] = await pool.query('UPDATE credit_packages SET ? WHERE id = ?', [allowed, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Package not found' });
  res.json({ ok: true });
});

router.delete('/packages/:id', async (req, res) => {
  const [result] = await pool.query('DELETE FROM credit_packages WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Package not found' });
  res.json({ ok: true });
});

// ---- Settings ----

router.get('/settings', async (_req, res) => {
  const [rows] = await pool.query('SELECT `key`, `value`, updated_at FROM settings ORDER BY `key`');
  res.json({ settings: rows });
});

router.put('/settings/:key', async (req, res) => {
  if (req.body?.value === undefined) return res.status(400).json({ error: 'value required' });
  await pool.query(
    'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    [req.params.key, String(req.body.value)]
  );
  res.json({ ok: true });
});

// ---- Global activity views ----

router.get('/transactions', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT ct.*, u.email FROM credit_transactions ct
     JOIN users u ON u.id = ct.user_id ORDER BY ct.id DESC LIMIT 200`
  );
  res.json({ transactions: rows });
});

router.get('/requests', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT ar.*, u.email FROM ai_requests ar
     JOIN users u ON u.id = ar.user_id ORDER BY ar.id DESC LIMIT 200`
  );
  res.json({ requests: rows });
});

router.get('/orders', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT o.*, u.email FROM orders o
     JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 200`
  );
  res.json({ orders: rows });
});

router.get('/stats', async (_req, res) => {
  const [[users]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'user'");
  const [[requests]] = await pool.query('SELECT COUNT(*) AS total FROM ai_requests');
  const [[creditsUsed]] = await pool.query(
    "SELECT COALESCE(SUM(-amount), 0) AS total FROM credit_transactions WHERE type = 'usage' AND amount < 0"
  );
  const [[revenue]] = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE status = 'paid'"
  );
  res.json({
    users: users.total,
    aiRequests: requests.total,
    creditsUsed: Number(creditsUsed.total),
    revenue: Number(revenue.total),
  });
});

export default router;
