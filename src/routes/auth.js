import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getSetting } from '../db.js';
import { User, toUserJson } from '../models.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { applyCreditChange } from '../services/creditService.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, name = '' } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await User.create({ email, password_hash: passwordHash, name: name.trim() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    throw err;
  }

  const bonus = Number(await getSetting('signup_bonus_credits', '0'));
  if (bonus > 0) {
    await applyCreditChange(user._id, bonus, 'signup_bonus', { description: 'Signup bonus' });
    user.credits_balance = bonus;
  }

  const json = toUserJson(user);
  res.status(201).json({ token: signToken(json), user: json });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.status === 'blocked') return res.status(403).json({ error: 'Account is blocked' });

  const json = toUserJson(user);
  res.json({ token: signToken(json), user: json });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
