import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, getSetting } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { applyCreditChange } from '../services/creditService.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, name = '' } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const passwordHash = await bcrypt.hash(password, 10);
  let userId;
  try {
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
      [email.toLowerCase().trim(), passwordHash, name.trim()]
    );
    userId = result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    throw err;
  }

  const bonus = Number(await getSetting('signup_bonus_credits', '0'));
  if (bonus > 0) {
    await applyCreditChange(userId, bonus, 'signup_bonus', { description: 'Signup bonus' });
  }

  const [rows] = await pool.query(
    'SELECT id, email, name, role, status, credits_balance FROM users WHERE id = ?',
    [userId]
  );
  res.status(201).json({ token: signToken(rows[0]), user: rows[0] });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (rows[0].status === 'blocked') return res.status(403).json({ error: 'Account is blocked' });

  const { password_hash, ...user } = rows[0];
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
