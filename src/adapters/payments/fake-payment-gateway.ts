import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { CheckoutConfirmation, PaymentGateway, WebhookEvent } from './payment-gateway';

/** Not a secret: it only signs fake confirmations, so tests can check the verification path. */
const FAKE_SIGNING_KEY = 'fake-payment-gateway';

const sign = (value: string): string =>
  createHmac('sha256', FAKE_SIGNING_KEY).update(value).digest('hex');

function safeEqual(first: string, second: string): boolean {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}

const shortHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 16);

/**
 * Development, tests and the demo only (env validation refuses it anywhere real). Stateless,
 * so the web app and the worker agree without sharing memory: ids are derived from inputs,
 * the "payment" succeeds at once and release and refund always succeed. No network.
 */
export const fakePaymentGateway: PaymentGateway = {
  name: 'fake',

  async createPayoutAccount(details) {
    return { accountId: `acc_fake_${shortHash(details.reference)}` };
  },

  async createHeldOrder(input) {
    const orderId = `order_fake_${shortHash(`${input.receipt}:${input.chargedMinor}`)}`;
    const paymentId = `pay_fake_${shortHash(orderId)}`;
    return { kind: 'fake', orderId, paymentId, signature: sign(`${orderId}|${paymentId}`) };
  },

  isCheckoutSignatureValid(confirmation: CheckoutConfirmation) {
    return safeEqual(
      sign(`${confirmation.orderId}|${confirmation.paymentId}`),
      confirmation.signature,
    );
  },

  readWebhook(rawBody: string, signature: string): WebhookEvent {
    if (!safeEqual(sign(rawBody), signature)) return { kind: 'invalid' };
    const parsed: unknown = JSON.parse(rawBody);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'orderId' in parsed &&
      'paymentId' in parsed &&
      typeof parsed.orderId === 'string' &&
      typeof parsed.paymentId === 'string'
    ) {
      return { kind: 'captured', orderId: parsed.orderId, paymentId: parsed.paymentId };
    }
    return { kind: 'ignored' };
  },

  async findHeldTransfer(paymentId) {
    return `trf_fake_${shortHash(paymentId)}`;
  },

  async releaseTransfer() {
    // Nothing is really held.
  },

  async refundPayment() {
    // Nothing was really charged.
  },
};

/** Signs a fake webhook body the way the fake gateway checks it (tests only). */
export function signFakeWebhook(rawBody: string): string {
  return sign(rawBody);
}
