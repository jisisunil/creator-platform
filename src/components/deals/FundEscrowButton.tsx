'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { confirmFundingAction, startFundingAction } from '@/app/[locale]/(app)/deals/actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ErrorCode } from '@/lib/http-errors-codes';

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayResponse {
  readonly razorpay_order_id: string;
  readonly razorpay_payment_id: string;
  readonly razorpay_signature: string;
}

interface RazorpayCheckout {
  open(): void;
}

type RazorpayConstructor = new (options: {
  key: string;
  order_id: string;
  name: string;
  description: string;
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
}) => RazorpayCheckout;

/** Loads Razorpay Checkout once (allowed by the CSP only when payments run on Razorpay). */
function loadCheckout(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.onload = () => {
      const loaded = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (loaded) resolve(loaded);
      else reject(new Error('Razorpay Checkout did not load'));
    };
    script.onerror = () => reject(new Error('Razorpay Checkout did not load'));
    document.head.append(script);
  });
}

/**
 * ADR-013: the brand pays the contract amount (plus the fee) into escrow. Razorpay Checkout
 * takes the payment; its signed confirmation is checked on the server. With the fake
 * gateway (development and demo) the payment is simulated after a confirmation prompt.
 */
export function FundEscrowButton({
  dealId,
  campaignName,
  totalLabel,
}: {
  dealId: string;
  campaignName: string;
  /** The total to pay, formatted, e.g. "₹30,708". */
  totalLabel: string;
}) {
  const t = useTranslations('deals.escrow.fund');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorCode, setErrorCode] = useState<ErrorCode | 'CHECKOUT_FAILED' | null>(null);

  async function finish(confirmation: { orderId: string; paymentId: string; signature: string }) {
    const result = await confirmFundingAction({ dealId, ...confirmation });
    setIsWorking(false);
    if (result.status === 'error') setErrorCode(result.code);
    else router.refresh();
  }

  async function pay() {
    setErrorCode(null);
    setIsWorking(true);
    const started = await startFundingAction(dealId);
    if (started.status === 'error') {
      setIsWorking(false);
      setErrorCode(started.code);
      return;
    }
    const { checkout } = started.data;
    if (checkout.kind === 'fake') {
      if (!window.confirm(t('fakeConfirm', { total: totalLabel }))) {
        setIsWorking(false);
        return;
      }
      await finish(checkout);
      return;
    }
    try {
      const Razorpay = await loadCheckout();
      new Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        name: t('checkoutName'),
        description: campaignName,
        handler: (response) =>
          void finish({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          }),
        modal: { ondismiss: () => setIsWorking(false) },
      }).open();
    } catch {
      // The checkout script couldn't load (network or blocker); the brand can try again.
      setIsWorking(false);
      setErrorCode('CHECKOUT_FAILED');
    }
  }

  return (
    <div className="grid gap-2">
      {errorCode ? (
        <Alert variant="destructive">
          {errorCode === 'CHECKOUT_FAILED' ? t('checkoutFailed') : tErrors(errorCode)}
        </Alert>
      ) : null}
      <Button type="button" className="w-fit" disabled={isWorking} onClick={() => void pay()}>
        {isWorking ? t('working') : t('pay', { total: totalLabel })}
      </Button>
    </div>
  );
}
