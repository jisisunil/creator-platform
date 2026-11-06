import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PaymentGatewayError } from '@/adapters/payments/payment-gateway';
import { createRazorpayGateway } from '@/adapters/payments/razorpay-gateway';

const SETTINGS = { keyId: 'rzp_test_key', keySecret: 'key-secret', webhookSecret: 'hook-secret' };
const hmac = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('hex');

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly authorization: string | null;
}

/** A stand-in for Razorpay's API: answers by method + path, records every call. */
function fakeRazorpay(answers: Record<string, { status?: number; body: unknown }[]>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    calls.push({
      method,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: headers.get('Authorization'),
    });
    const key = `${method} ${new URL(url).pathname}`;
    const answer = answers[key]?.shift();
    if (!answer) throw new Error(`unexpected call ${key}`);
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as typeof fetch;
  return { calls, gateway: createRazorpayGateway(SETTINGS, fetchImpl) };
}

describe('Razorpay gateway (ADR-013)', () => {
  it('creates an order whose transfer to the creator is held, with basic auth', async () => {
    const { calls, gateway } = fakeRazorpay({ 'POST /v1/orders': [{ body: { id: 'order_1' } }] });

    const checkout = await gateway.createHeldOrder({
      chargedMinor: 3_070_800,
      transferMinor: 3_000_000,
      currencyCode: 'INR',
      payoutAccountId: 'acc_9',
      receipt: 'deal_1',
    });

    expect(checkout).toEqual({ kind: 'razorpay', keyId: 'rzp_test_key', orderId: 'order_1' });
    expect(calls[0]?.authorization).toBe(
      `Basic ${Buffer.from('rzp_test_key:key-secret').toString('base64')}`,
    );
    expect(calls[0]?.body).toEqual({
      amount: 3_070_800,
      currency: 'INR',
      receipt: 'deal_1',
      transfers: [{ account: 'acc_9', amount: 3_000_000, currency: 'INR', on_hold: true }],
    });
  });

  it('accepts only checkout confirmations signed with the key secret', () => {
    const { gateway } = fakeRazorpay({});
    const signature = hmac('key-secret', 'order_1|pay_1');

    expect(
      gateway.isCheckoutSignatureValid({ orderId: 'order_1', paymentId: 'pay_1', signature }),
    ).toBe(true);
    expect(
      gateway.isCheckoutSignatureValid({ orderId: 'order_2', paymentId: 'pay_1', signature }),
    ).toBe(false);
    expect(
      gateway.isCheckoutSignatureValid({ orderId: 'order_1', paymentId: 'pay_1', signature: 'x' }),
    ).toBe(false);
  });

  it('reads captured payments from signed webhooks and refuses unsigned ones', () => {
    const { gateway } = fakeRazorpay({});
    const captured = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } },
    });
    const other = JSON.stringify({ event: 'refund.processed', payload: {} });

    expect(gateway.readWebhook(captured, hmac('hook-secret', captured))).toEqual({
      kind: 'captured',
      orderId: 'order_1',
      paymentId: 'pay_1',
    });
    expect(gateway.readWebhook(captured, hmac('key-secret', captured))).toEqual({
      kind: 'invalid',
    });
    expect(gateway.readWebhook(other, hmac('hook-secret', other))).toEqual({ kind: 'ignored' });
  });

  it('releases a held transfer, and refunds only once', async () => {
    const { calls, gateway } = fakeRazorpay({
      'GET /v1/payments/pay_1/transfers': [{ body: { items: [{ id: 'trf_1' }] } }],
      'PATCH /v1/transfers/trf_1': [{ body: { id: 'trf_1' } }],
      'GET /v1/payments/pay_2/refunds': [{ body: { count: 0 } }, { body: { count: 1 } }],
      'POST /v1/payments/pay_2/refund': [{ body: { id: 'rfnd_1' } }],
    });

    await gateway.releaseTransfer((await gateway.findHeldTransfer('pay_1')) ?? '');
    await gateway.refundPayment('pay_2', 3_000_000);
    await gateway.refundPayment('pay_2', 3_000_000);

    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ on_hold: false });
    const refunds = calls.filter((call) => call.url.endsWith('/refund'));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.body).toEqual({ amount: 3_000_000, reverse_all: 1 });
  });

  it('sets up a payout account in Razorpay’s four steps', async () => {
    const { calls, gateway } = fakeRazorpay({
      'POST /v2/accounts': [{ body: { id: 'acc_1' } }],
      'POST /v2/accounts/acc_1/stakeholders': [{ body: { id: 'sth_1' } }],
      'POST /v2/accounts/acc_1/products': [{ body: { id: 'acc_prd_1' } }],
      'PATCH /v2/accounts/acc_1/products/acc_prd_1': [{ body: { id: 'acc_prd_1' } }],
    });

    const result = await gateway.createPayoutAccount({
      email: 'asha@example.in',
      phone: '9876543210',
      legalName: 'Asha Rao',
      pan: 'ABCDE1234F',
      accountHolderName: 'Asha Rao',
      accountNumber: '123456789012',
      ifsc: 'HDFC0001234',
      reference: 'creator_1',
    });

    expect(result).toEqual({ accountId: 'acc_1' });
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'POST /v2/accounts',
      'POST /v2/accounts/acc_1/stakeholders',
      'POST /v2/accounts/acc_1/products',
      'PATCH /v2/accounts/acc_1/products/acc_prd_1',
    ]);
    expect(calls[3]?.body).toMatchObject({
      settlements: { account_number: '123456789012', ifsc_code: 'HDFC0001234' },
    });
  });

  it('turns a refusal into REJECTED without retrying', async () => {
    const { calls, gateway } = fakeRazorpay({
      'POST /v2/accounts': [
        { status: 400, body: { error: { description: 'Invalid PAN' } } },
        { body: { id: 'never' } },
      ],
    });

    const attempt = gateway.createPayoutAccount({
      email: 'a@b.in',
      phone: '9876543210',
      legalName: 'A',
      pan: 'X',
      accountHolderName: 'A',
      accountNumber: '1',
      ifsc: 'X',
      reference: 'c',
    });

    await expect(attempt).rejects.toBeInstanceOf(PaymentGatewayError);
    await expect(attempt).rejects.toMatchObject({ kind: 'REJECTED', message: 'Invalid PAN' });
    expect(calls).toHaveLength(1);
  });
});
