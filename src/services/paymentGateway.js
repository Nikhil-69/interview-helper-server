import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils.js';
import { config } from '../config.js';

/**
 * Payment gateway interface. Two implementations:
 * - RazorpayGateway: used whenever RAZORPAY_KEY_ID is configured. Orders are
 *   paid through a hosted Payment Link opened in the user's browser, and
 *   confirmation arrives via the signed webhook (routes/orders.js POST /webhook).
 * - MockGateway: dev fallback with no credentials. Auto-approves via the
 *   client-triggered POST /orders/:id/pay route.
 */
class MockGateway {
  name = 'mock';

  // Returns a gateway-side order id the client would normally open checkout with.
  async createOrder({ amount, currency, orderId }) {
    return {
      gatewayOrderId: `mock_${orderId}_${crypto.randomBytes(6).toString('hex')}`,
      paymentUrl: null, // no hosted page — client falls back to POST /orders/:id/pay
      amount,
      currency,
    };
  }

  // Real gateways verify a signature/webhook here. Mock always succeeds.
  async capturePayment() {
    return { success: true };
  }
}

class RazorpayGateway {
  name = 'razorpay';

  constructor(keyId, keySecret) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder({ amount, currency, orderId, customer }) {
    const link = await this.client.paymentLink.create({
      amount: Math.round(amount * 100), // Razorpay amounts are in paise
      currency,
      reference_id: orderId, // echoed back in the webhook — how we find the Order
      description: `Interview Copilot credits — order ${orderId}`,
      ...(customer?.email ? { customer, notify: { sms: false, email: true } } : {}),
    });
    return {
      gatewayOrderId: link.id,
      paymentUrl: link.short_url,
      amount,
      currency,
    };
  }

  // Razorpay payments are confirmed by the signed webhook, never by the
  // client claiming success — this exists only to satisfy the interface.
  async capturePayment() {
    throw new Error('Razorpay payments are confirmed via webhook, not capturePayment()');
  }
}

export function verifyRazorpayWebhook(rawBody, signature) {
  if (!config.razorpayWebhookSecret || !signature || !rawBody) return false;
  try {
    return validateWebhookSignature(rawBody.toString(), signature, config.razorpayWebhookSecret);
  } catch {
    return false;
  }
}

export const gateway = config.razorpayKeyId
  ? new RazorpayGateway(config.razorpayKeyId, config.razorpayKeySecret)
  : new MockGateway();
