import crypto from 'node:crypto';

/**
 * Payment gateway interface. The mock implementation auto-approves payments.
 * To go live, add a RazorpayGateway/StripeGateway with the same two methods
 * and switch the export below.
 */
class MockGateway {
  name = 'mock';

  // Returns a gateway-side order id the client would normally open checkout with.
  async createOrder({ amount, currency, orderId }) {
    return { gatewayOrderId: `mock_${orderId}_${crypto.randomBytes(6).toString('hex')}`, amount, currency };
  }

  // Real gateways verify a signature/webhook here. Mock always succeeds.
  async capturePayment() {
    return { success: true };
  }
}

export const gateway = new MockGateway();
