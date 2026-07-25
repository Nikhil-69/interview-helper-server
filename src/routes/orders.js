import { Router } from 'express';
import { CreditPackage, Order } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
import { gateway, verifyRazorpayWebhook } from '../services/paymentGateway.js';
import { applyCreditChange } from '../services/creditService.js';

const router = Router();

const toOrderJson = (o) => ({
  id: o._id.toString(),
  credits: o.credits,
  amount: o.amount,
  currency: o.currency,
  status: o.status,
  created_at: o.created_at,
  paid_at: o.paid_at,
});

router.get('/packages', async (_req, res) => {
  const rows = await CreditPackage.find({ is_active: true }).sort({ credits: 1 }).lean();
  res.json({
    packages: rows.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      credits: p.credits,
      price: p.price,
      currency: p.currency,
    })),
  });
});

// Step 1: create a pending order for a package.
router.post('/', requireAuth, async (req, res) => {
  const { packageId } = req.body || {};
  const pkg = await CreditPackage.findOne({ _id: packageId, is_active: true }).catch(() => null);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  const order = await Order.create({
    user_id: req.user.id,
    package_id: pkg._id,
    credits: pkg.credits,
    amount: pkg.price,
    currency: pkg.currency,
    gateway: gateway.name,
  });

  const { gatewayOrderId, paymentUrl } = await gateway.createOrder({
    amount: pkg.price,
    currency: pkg.currency,
    orderId: order._id.toString(),
    customer: { name: req.user.name || undefined, email: req.user.email },
  });
  order.gateway_order_id = gatewayOrderId;
  await order.save();

  res.status(201).json({
    orderId: order._id.toString(),
    gatewayOrderId,
    paymentUrl, // null on the mock gateway — client falls back to POST /:id/pay
    amount: pkg.price,
    currency: pkg.currency,
    credits: pkg.credits,
  });
});

// Razorpay calls this directly (configure the URL + secret in Dashboard →
// Webhooks). Payment truth comes from here, never from the client.
router.post('/webhook', async (req, res) => {
  if (!verifyRazorpayWebhook(req.rawBody, req.headers['x-razorpay-signature'])) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body?.event;
  if (event !== 'payment_link.paid') return res.json({ ok: true }); // not ours; ack so Razorpay stops retrying

  const linkEntity = req.body?.payload?.payment_link?.entity;
  const paymentEntity = req.body?.payload?.payment?.entity;
  const order = await Order.findById(linkEntity?.reference_id).catch(() => null);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Webhooks can be redelivered — a paid order is a successful no-op.
  if (order.status === 'paid') return res.json({ ok: true });

  order.status = 'paid';
  order.paid_at = new Date();
  order.gateway_payment_id = paymentEntity?.id || null;
  await order.save();

  await applyCreditChange(order.user_id, order.credits, 'purchase', {
    referenceId: order._id.toString(),
    description: `Purchase: order #${order._id}`,
  });

  res.json({ ok: true });
});

// Step 2: capture payment (mock auto-approves) and credit the account.
router.post('/:id/pay', requireAuth, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id }).catch(() => null);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'paid') return res.status(409).json({ error: 'Order already paid' });

  const capture = await gateway.capturePayment({ gatewayOrderId: order.gateway_order_id, payload: req.body });
  if (!capture.success) {
    order.status = 'failed';
    await order.save();
    return res.status(402).json({ error: 'Payment failed' });
  }

  order.status = 'paid';
  order.paid_at = new Date();
  await order.save();
  const { balance } = await applyCreditChange(req.user.id, order.credits, 'purchase', {
    referenceId: order._id.toString(),
    description: `Purchase: order #${order._id}`,
  });

  res.json({ status: 'paid', creditsAdded: order.credits, credits: balance });
});

// Single-order status — polled by the desktop app while it waits for the
// webhook to confirm a Payment Link payment.
router.get('/:id', requireAuth, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id }).catch(() => null);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: toOrderJson(order) });
});

router.get('/', requireAuth, async (req, res) => {
  const rows = await Order.find({ user_id: req.user.id }).sort({ _id: -1 }).limit(50).lean();
  res.json({ orders: rows.map(toOrderJson) });
});

export default router;
