import { Router } from 'express';
import { getSetting } from '../db.js';
import { AiRequest } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
import { askAI } from '../services/kimiWrapper.js';
import { getPromptModes, isKnownPromptMode } from '../services/prompts.js';
import { applyCreditChange } from '../services/creditService.js';

const router = Router();

/**
 * GET /api/ai/prompt-modes
 * Preset prompt cases the app shows in place of the old pre-meeting prompt:
 * coding (interview/OA/learning), non-coding (MCQ/learning/descriptive), mix, custom.
 */
router.get('/prompt-modes', requireAuth, (req, res) => {
  res.json({ modes: getPromptModes() });
});

/**
 * POST /api/ai/ask
 * Deducts credits up front (so a user can't fire unpaid requests), refunds on
 * provider failure, and logs every request to ai_requests.
 */
router.post('/ask', requireAuth, async (req, res) => {
  const {
    context = '',
    history = [],
    question = '',
    imageSrc = null,
    images = null,
    promptMode = '',
    customPrompt = '',
  } = req.body || {};
  if (!isKnownPromptMode(promptMode)) return res.status(400).json({ error: 'Unknown promptMode' });
  // Accept the new `images` array; fall back to legacy single `imageSrc` from older clients.
  const imageList = (Array.isArray(images) ? images : imageSrc ? [imageSrc] : []).filter(Boolean);
  if (!question && !imageList.length) return res.status(400).json({ error: 'question or images required' });

  const requestType = imageList.length ? 'vision' : 'text';
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
    const result = await askAI({
      context,
      history,
      question,
      images: imageList,
      promptMode,
      customPrompt,
      preferredKimiModel: req.user.openai_model,
      preferredVertexModel: req.user.vertex_model,
    });
    await AiRequest.create({
      user_id: req.user.id,
      request_type: requestType,
      model: result.model,
      credits_charged: cost,
      status: 'success',
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
    });
    res.json({ answer: result.answer, credits: balance, creditsCharged: cost });
  } catch (err) {
    const refund = await applyCreditChange(req.user.id, cost, 'usage', {
      description: `Refund: failed AI request (${requestType})`,
    });
    await AiRequest.create({
      user_id: req.user.id,
      request_type: requestType,
      model: '',
      credits_charged: 0,
      status: 'failed',
      error_message: String(err.message).slice(0, 500),
    });
    const status = err.code === 'AI_NOT_CONFIGURED' ? 503 : 502;
    res.status(status).json({ error: `AI request failed: ${err.message}`, credits: refund.balance });
  }
});

export default router;
