import { Router } from 'express';
import { CreditPackage, Order } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
import { gateway } from '../services/paymentGateway.js';
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

  const { gatewayOrderId } = await gateway.createOrder({
    amount: pkg.price,
    currency: pkg.currency,
    orderId: order._id.toString(),
  });
  order.gateway_order_id = gatewayOrderId;
  await order.save();

  res.status(201).json({
    orderId: order._id.toString(),
    gatewayOrderId,
    amount: pkg.price,
    currency: pkg.currency,
    credits: pkg.credits,
  });
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

router.get('/', requireAuth, async (req, res) => {
  const rows = await Order.find({ user_id: req.user.id }).sort({ _id: -1 }).limit(50).lean();
  res.json({ orders: rows.map(toOrderJson) });
});

export default router;
