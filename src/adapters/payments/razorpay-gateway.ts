import { createHmac, timingSafeEqual } from 'node:crypto';
import { getLogger } from '@/lib/logger';
import {
  type CheckoutConfirmation,
  type PaymentGateway,
  PaymentGatewayError,
  type WebhookEvent,
} from './payment-gateway';

const API = 'https://api.razorpay.com';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const logger = getLogger('payments');

export interface RazorpaySettings {
  readonly keyId: string;
  readonly keySecret: string;
  readonly webhookSecret: string;
}

const hmacHex = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('hex');

function safeEqual(first: string, second: string): boolean {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}

function field(value: unknown, ...path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PaymentGatewayError('TRANSIENT', `Razorpay response without ${what}`);
  }
  return value;
}

/**
 * Razorpay Route (ADR-013): the brand pays an order whose transfer to the creator's linked
 * account is created "on hold"; approval releases it, a refund reverses it. Basic auth with
 * the key pair; webhooks and checkout confirmations are checked with HMAC-SHA256.
 *
 * Verify against Razorpay test mode before going live (X-08): especially the linked-account
 * fields, which Razorpay may extend (e.g. a registered address, see Q-48).
 */
export function createRazorpayGateway(
  settings: RazorpaySettings,
  fetchImpl: typeof fetch = fetch,
): PaymentGateway {
  const authorization = `Basic ${Buffer.from(`${settings.keyId}:${settings.keySecret}`).toString('base64')}`;

  /** One API call with a timeout; network errors and 5xx are retried with back-off. */
  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    let lastError = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchImpl(`${API}${path}`, {
          method,
          headers: { Authorization: authorization, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const text = await response.text();
        const json: unknown = text ? JSON.parse(text) : null;
        if (response.ok) return json;
        const description = String(field(json, 'error', 'description') ?? response.status);
        if (response.status < 500) {
          // Never log request bodies: they can hold PAN and bank details.
          logger.warn({ action: 'razorpay.rejected', path, status: response.status }, description);
          throw new PaymentGatewayError('REJECTED', description);
        }
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        if (error instanceof PaymentGatewayError) throw error;
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, BASE_BACKOFF_MS * 2 ** (attempt - 1)));
      }
    }
    throw new PaymentGatewayError('TRANSIENT', lastError);
  }

  return {
    name: 'razorpay',

    async createPayoutAccount(details) {
      const account = await call('POST', '/v2/accounts', {
        email: details.email,
        phone: details.phone,
        type: 'route',
        reference_id: details.reference,
        legal_business_name: details.legalName,
        business_type: 'individual',
        contact_name: details.legalName,
      });
      const accountId = requireString(field(account, 'id'), 'account id');
      await call('POST', `/v2/accounts/${accountId}/stakeholders`, {
        name: details.legalName,
        email: details.email,
        kyc: { pan: details.pan },
      });
      const product = await call('POST', `/v2/accounts/${accountId}/products`, {
        product_name: 'route',
        tnc_accepted: true,
      });
      const productId = requireString(field(product, 'id'), 'product id');
      await call('PATCH', `/v2/accounts/${accountId}/products/${productId}`, {
        settlements: {
          account_number: details.accountNumber,
          ifsc_code: details.ifsc,
          beneficiary_name: details.accountHolderName,
        },
        tnc_accepted: true,
      });
      return { accountId };
    },

    async createHeldOrder(input) {
      const order = await call('POST', '/v1/orders', {
        amount: input.chargedMinor,
        currency: input.currencyCode,
        receipt: input.receipt,
        transfers: [
          {
            account: input.payoutAccountId,
            amount: input.transferMinor,
            currency: input.currencyCode,
            on_hold: true,
          },
        ],
      });
      return {
        kind: 'razorpay',
        keyId: settings.keyId,
        orderId: requireString(field(order, 'id'), 'order id'),
      };
    },

    isCheckoutSignatureValid(confirmation: CheckoutConfirmation) {
      const expected = hmacHex(
        settings.keySecret,
        `${confirmation.orderId}|${confirmation.paymentId}`,
      );
      return safeEqual(expected, confirmation.signature);
    },

    readWebhook(rawBody: string, signature: string): WebhookEvent {
      if (!safeEqual(hmacHex(settings.webhookSecret, rawBody), signature)) {
        return { kind: 'invalid' };
      }
      const event: unknown = JSON.parse(rawBody);
      const name = field(event, 'event');
      if (name !== 'payment.captured' && name !== 'order.paid') return { kind: 'ignored' };
      const payment = field(event, 'payload', 'payment', 'entity');
      const orderId = field(payment, 'order_id');
      const paymentId = field(payment, 'id');
      return typeof orderId === 'string' && typeof paymentId === 'string'
        ? { kind: 'captured', orderId, paymentId }
        : { kind: 'ignored' };
    },

    async findHeldTransfer(paymentId) {
      const transfers = await call('GET', `/v1/payments/${paymentId}/transfers`);
      const items = field(transfers, 'items');
      const first: unknown = Array.isArray(items) ? items[0] : undefined;
      const id = field(first, 'id');
      return typeof id === 'string' ? id : null;
    },

    async releaseTransfer(transferId) {
      await call('PATCH', `/v1/transfers/${transferId}`, { on_hold: false });
    },

    async refundPayment(paymentId, amountMinor) {
      // A retry after a lost response must not refund twice.
      const refunds = await call('GET', `/v1/payments/${paymentId}/refunds`);
      const count = field(refunds, 'count');
      if (typeof count === 'number' && count > 0) return;
      await call('POST', `/v1/payments/${paymentId}/refund`, {
        amount: amountMinor,
        reverse_all: 1,
      });
    },
  };
}
