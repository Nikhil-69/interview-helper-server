import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/balance', requireAuth, (req, res) => {
  res.json({ credits: req.user.credits_balance });
});

router.get('/transactions', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const [rows] = await pool.query(
    `SELECT id, type, amount, balance_after, description, created_at
     FROM credit_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    [req.user.id, limit]
  );
  res.json({ transactions: rows });
});

export default router;
