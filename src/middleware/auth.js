import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const [rows] = await pool.query(
    'SELECT id, email, name, role, status, credits_balance FROM users WHERE id = ?',
    [payload.sub]
  );
  if (!rows.length) return res.status(401).json({ error: 'User not found' });
  if (rows[0].status === 'blocked') return res.status(403).json({ error: 'Account is blocked' });

  req.user = rows[0];
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}
