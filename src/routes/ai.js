import { Router } from 'express';
import { pool, getSetting } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { askAI } from '../services/openaiWrapper.js';
import { applyCreditChange } from '../services/creditService.js';

const router = Router();

/**
 * POST /api/ai/ask
 * Deducts credits up front (so a user can't fire unpaid requests), refunds on
 * provider failure, and logs every request to ai_requests.
 */
router.post('/ask', requireAuth, async (req, res) => {
  const { context = '', history = [], question = '', imageSrc = null } = req.body || {};
  if (!question && !imageSrc) return res.status(400).json({ error: 'question or imageSrc required' });

  const requestType = imageSrc ? 'vision' : 'text';
  const costKey = requestType === 'vision' ? 'credit_cost_vision' : 'credit_cost_text';
  const cost = Number(await getSetting(costKey, '1'));

  let balance;
  try {
    ({ balance } = await applyCreditChange(req.user.id, -cost, 'usage', {
      description: `AI request (${requestType})`,
    }));
  } catch (err) {
    if (err.code === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({ error: 'Insufficient credits', credits: req.user.credits_balance });
    }
    throw err;
  }

  try {
    const result = await askAI({ context, history, question, imageSrc });
    await pool.query(
      `INSERT INTO ai_requests (user_id, request_type, model, credits_charged, status, prompt_tokens, completion_tokens)
       VALUES (?, ?, ?, ?, 'success', ?, ?)`,
      [req.user.id, requestType, result.model, cost, result.promptTokens, result.completionTokens]
    );
    res.json({ answer: result.answer, credits: balance, creditsCharged: cost });
  } catch (err) {
    const refund = await applyCreditChange(req.user.id, cost, 'usage', {
      description: `Refund: failed AI request (${requestType})`,
    });
    await pool.query(
      `INSERT INTO ai_requests (user_id, request_type, model, credits_charged, status, error_message)
       VALUES (?, ?, '', 0, 'failed', ?)`,
      [req.user.id, requestType, String(err.message).slice(0, 500)]
    );
    const status = err.code === 'AI_NOT_CONFIGURED' ? 503 : 502;
    res.status(status).json({ error: `AI request failed: ${err.message}`, credits: refund.balance });
  }
});

export default router;
