import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { gateway } from '../services/paymentGateway.js';
import { applyCreditChange } from '../services/creditService.js';

const router = Router();

router.get('/packages', async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, credits, price, currency FROM credit_packages WHERE is_active = 1 ORDER BY credits'
  );
  res.json({ packages: rows });
});

// Step 1: create a pending order for a package.
router.post('/', requireAuth, async (req, res) => {
  const { packageId } = req.body || {};
  const [pkgs] = await pool.query('SELECT * FROM credit_packages WHERE id = ? AND is_active = 1', [packageId]);
  if (!pkgs.length) return res.status(404).json({ error: 'Package not found' });
  const pkg = pkgs[0];

  const [result] = await pool.query(
    `INSERT INTO orders (user_id, package_id, credits, amount, currency, gateway)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, pkg.id, pkg.credits, pkg.price, pkg.currency, gateway.name]
  );
  const orderId = result.insertId;

  const { gatewayOrderId } = await gateway.createOrder({
    amount: pkg.price,
    currency: pkg.currency,
    orderId,
  });
  await pool.query('UPDATE orders SET gateway_order_id = ? WHERE id = ?', [gatewayOrderId, orderId]);

  res.status(201).json({ orderId, gatewayOrderId, amount: pkg.price, currency: pkg.currency, credits: pkg.credits });
});

// Step 2: capture payment (mock auto-approves) and credit the account.
router.post('/:id/pay', requireAuth, async (req, res) => {
  const [orders] = await pool.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (!orders.length) return res.status(404).json({ error: 'Order not found' });
  const order = orders[0];
  if (order.status === 'paid') return res.status(409).json({ error: 'Order already paid' });

  const capture = await gateway.capturePayment({ gatewayOrderId: order.gateway_order_id, payload: req.body });
  if (!capture.success) {
    await pool.query("UPDATE orders SET status = 'failed' WHERE id = ?", [order.id]);
    return res.status(402).json({ error: 'Payment failed' });
  }

  await pool.query("UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = ?", [order.id]);
  const { balance } = await applyCreditChange(req.user.id, order.credits, 'purchase', {
    referenceId: order.id,
    description: `Purchase: order #${order.id}`,
  });

  res.json({ status: 'paid', creditsAdded: order.credits, credits: balance });
});

router.get('/', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, credits, amount, currency, status, created_at, paid_at
     FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ orders: rows });
});

export default router;
