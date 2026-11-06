import { NextResponse } from 'next/server';
import { getContainer } from '@/adapters/container';
import { getLogger } from '@/lib/logger';
import { handleRoute } from '@/lib/route';
import { recordCapturedPayment } from '@/services/deals';
import { recordSecurityEvent } from '@/services/security';

const SIGNATURE_HEADER = 'x-razorpay-signature';
/** Webhook bodies are small JSON events; anything bigger isn't from the gateway. */
const MAX_BODY_BYTES = 64 * 1024;
const logger = getLogger('payments');

/**
 * ADR-013: the payment gateway reports captured payments here (configure this URL and its
 * secret in the Razorpay dashboard). Only signed events count; others are refused. Events
 * we don't need get 200 so the gateway doesn't retry them.
 */
export function POST(request: Request): Promise<NextResponse> {
  return handleRoute(request, async () => {
    const container = getContainer();
    const gateway = container.paymentGateway;
    if (!gateway) return new NextResponse(null, { status: 404 });
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
    const signature = request.headers.get(SIGNATURE_HEADER) ?? '';
    let event;
    try {
      event = gateway.readWebhook(rawBody, signature);
    } catch (error) {
      // Signed but not JSON: nothing we can use.
      logger.warn({ action: 'payment.webhook-unreadable', err: error }, 'unreadable webhook');
      return new NextResponse(null, { status: 400 });
    }
    if (event.kind === 'invalid') {
      await recordSecurityEvent(container.repos, {
        action: 'payment.webhook-signature-rejected',
        actorUserId: null,
      });
      return new NextResponse(null, { status: 401 });
    }
    if (event.kind === 'captured') await recordCapturedPayment(container, event);
    return new NextResponse(null, { status: 200 });
  });
}
