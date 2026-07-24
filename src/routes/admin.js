import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { SETTING_DEFAULTS } from '../db.js';
import { User, CreditTransaction, CreditPackage, Order, AiRequest, Setting, toUserJson } from '../models.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { applyCreditChange } from '../services/creditService.js';
import { getAvailableModels, isKnownOpenAIModel, isKnownVertexModel } from '../services/aiModels.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const emailOf = (populated) => populated?.email ?? '(deleted)';

const toTxJson = (t) => ({
  id: t._id.toString(),
  email: emailOf(t.user_id),
  type: t.type,
  amount: t.amount,
  balance_after: t.balance_after,
  description: t.description,
  created_at: t.created_at,
});

// ---- Users CRUD ----

router.get('/users', async (req, res) => {
  const filter = req.query.q
    ? {
        $or: [
          { email: { $regex: req.query.q, $options: 'i' } },
          { name: { $regex: req.query.q, $options: 'i' } },
        ],
      }
    : {};
  const users = await User.find(filter).sort({ _id: -1 }).limit(200);
  res.json({ users: users.map(toUserJson) });
});

router.post('/users', async (req, res) => {
  const { email, password, name = '', role = 'user', credits = 0 } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await User.create({
      email,
      password_hash: passwordHash,
      name,
      role: role === 'admin' ? 'admin' : 'user',
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already exists' });
    throw err;
  }
  if (Number(credits) > 0) {
    await applyCreditChange(user._id, Number(credits), 'admin_adjustment', {
      description: 'Initial credits (admin-created account)',
    });
  }
  res.status(201).json({ id: user._id.toString() });
});

router.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const transactions = await CreditTransaction.find({ user_id: user._id }).sort({ _id: -1 }).limit(100).lean();
  const requests = await AiRequest.find({ user_id: user._id }).sort({ _id: -1 }).limit(100).lean();
  res.json({
    user: toUserJson(user),
    transactions: transactions.map((t) => ({
      id: t._id.toString(),
      type: t.type,
      amount: t.amount,
      balance_after: t.balance_after,
      description: t.description,
      created_at: t.created_at,
    })),
    requests: requests.map((r) => ({
      id: r._id.toString(),
      request_type: r.request_type,
      model: r.model,
      credits_charged: r.credits_charged,
      status: r.status,
      error_message: r.error_message,
      created_at: r.created_at,
    })),
  });
});

router.patch('/users/:id', async (req, res) => {
  const allowed = {};
  if (req.body.name !== undefined) allowed.name = req.body.name;
  if (['active', 'blocked'].includes(req.body.status)) allowed.status = req.body.status;
  if (['user', 'admin'].includes(req.body.role)) allowed.role = req.body.role;
  if (req.body.openai_model !== undefined) {
    const model = String(req.body.openai_model);
    if (!isKnownOpenAIModel(model)) return res.status(400).json({ error: 'Unknown openai_model' });
    allowed.openai_model = model;
  }
  if (req.body.vertex_model !== undefined) {
    const model = String(req.body.vertex_model);
    if (!isKnownVertexModel(model)) return res.status(400).json({ error: 'Unknown vertex_model' });
    allowed.vertex_model = model;
  }
  if (req.body.password) allowed.password_hash = await bcrypt.hash(req.body.password, 10);
  if (!Object.keys(allowed).length) return res.status(400).json({ error: 'Nothing to update' });

  const user = await User.findByIdAndUpdate(req.params.id, allowed).catch(() => null);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const user = await User.findByIdAndDelete(req.params.id).catch(() => null);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // No FK cascades in Mongo — clean up the user's history explicitly.
  await Promise.all([
    CreditTransaction.deleteMany({ user_id: user._id }),
    Order.deleteMany({ user_id: user._id }),
    AiRequest.deleteMany({ user_id: user._id }),
  ]);
  res.json({ ok: true });
});

// ---- Credit adjustment ----

router.post('/users/:id/credits', async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero integer (negative to deduct)' });
  }
  try {
    const { balance } = await applyCreditChange(req.params.id, amount, 'admin_adjustment', {
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

const toPackageJson = (p) => ({
  id: p._id.toString(),
  name: p.name,
  credits: p.credits,
  price: p.price,
  currency: p.currency,
  is_active: p.is_active,
  created_at: p.created_at,
});

router.get('/packages', async (_req, res) => {
  const rows = await CreditPackage.find().sort({ credits: 1 }).lean();
  res.json({ packages: rows.map(toPackageJson) });
});

router.post('/packages', async (req, res) => {
  const { name, credits, price, currency = 'INR', isActive = true } = req.body || {};
  if (!name || !Number(credits) || price === undefined) {
    return res.status(400).json({ error: 'name, credits, price required' });
  }
  const pkg = await CreditPackage.create({
    name,
    credits: Number(credits),
    price: Number(price),
    currency,
    is_active: !!isActive,
  });
  res.status(201).json({ id: pkg._id.toString() });
});

router.patch('/packages/:id', async (req, res) => {
  const allowed = {};
  if (req.body.name !== undefined) allowed.name = req.body.name;
  if (req.body.credits !== undefined) allowed.credits = Number(req.body.credits);
  if (req.body.price !== undefined) allowed.price = Number(req.body.price);
  if (req.body.currency !== undefined) allowed.currency = req.body.currency;
  if (req.body.isActive !== undefined) allowed.is_active = !!req.body.isActive;
  if (!Object.keys(allowed).length) return res.status(400).json({ error: 'Nothing to update' });
  const pkg = await CreditPackage.findByIdAndUpdate(req.params.id, allowed).catch(() => null);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  res.json({ ok: true });
});

router.delete('/packages/:id', async (req, res) => {
  const pkg = await CreditPackage.findByIdAndDelete(req.params.id).catch(() => null);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  res.json({ ok: true });
});

// ---- AI models ----

router.get('/models', async (_req, res) => {
  res.json({ models: await getAvailableModels() });
});

// ---- Settings ----

router.get('/settings', async (_req, res) => {
  const docs = await Setting.find().lean();
  const stored = Object.fromEntries(docs.map((d) => [d.key, d]));
  const settings = Object.keys({ ...SETTING_DEFAULTS, ...stored })
    .sort()
    .map((key) => ({
      key,
      value: stored[key]?.value ?? SETTING_DEFAULTS[key],
      updated_at: stored[key]?.updated_at ?? null,
    }));
  res.json({ settings });
});

router.put('/settings/:key', async (req, res) => {
  if (req.body?.value === undefined) return res.status(400).json({ error: 'value required' });
  await Setting.findOneAndUpdate(
    { key: req.params.key },
    { value: String(req.body.value) },
    { upsert: true }
  );
  res.json({ ok: true });
});

// ---- Global activity views ----

router.get('/transactions', async (_req, res) => {
  const rows = await CreditTransaction.find().sort({ _id: -1 }).limit(200).populate('user_id', 'email').lean();
  res.json({ transactions: rows.map(toTxJson) });
});

router.get('/requests', async (_req, res) => {
  const rows = await AiRequest.find().sort({ _id: -1 }).limit(200).populate('user_id', 'email').lean();
  res.json({
    requests: rows.map((r) => ({
      id: r._id.toString(),
      email: emailOf(r.user_id),
      request_type: r.request_type,
      model: r.model,
      credits_charged: r.credits_charged,
      status: r.status,
      error_message: r.error_message,
      prompt_tokens: r.prompt_tokens,
      completion_tokens: r.completion_tokens,
      created_at: r.created_at,
    })),
  });
});

router.get('/orders', async (_req, res) => {
  const rows = await Order.find().sort({ _id: -1 }).limit(200).populate('user_id', 'email').lean();
  res.json({
    orders: rows.map((o) => ({
      id: o._id.toString(),
      email: emailOf(o.user_id),
      credits: o.credits,
      amount: o.amount,
      currency: o.currency,
      status: o.status,
      created_at: o.created_at,
      paid_at: o.paid_at,
    })),
  });
});

router.get('/stats', async (_req, res) => {
  const [users, aiRequests, usage, revenue] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    AiRequest.countDocuments(),
    CreditTransaction.aggregate([
      { $match: { type: 'usage', amount: { $lt: 0 } } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$amount', -1] } } } },
    ]),
    Order.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  res.json({
    users,
    aiRequests,
    creditsUsed: usage[0]?.total ?? 0,
    revenue: revenue[0]?.total ?? 0,
  });
});

export default router;
