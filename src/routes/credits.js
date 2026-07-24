import { Router } from 'express';
import { CreditTransaction } from '../models.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const toTxJson = (t) => ({
  id: t._id.toString(),
  type: t.type,
  amount: t.amount,
  balance_after: t.balance_after,
  description: t.description,
  created_at: t.created_at,
});

router.get('/balance', requireAuth, (req, res) => {
  res.json({ credits: req.user.credits_balance });
});

router.get('/transactions', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await CreditTransaction.find({ user_id: req.user.id })
    .sort({ _id: -1 })
    .limit(limit)
    .lean();
  res.json({ transactions: rows.map(toTxJson) });
});

export default router;
