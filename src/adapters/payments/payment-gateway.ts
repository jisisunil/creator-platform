/**
 * A payment gateway that holds a brand's payment until the work is approved (ADR-013).
 * Implementations: Razorpay Route (`razorpay-gateway.ts`) and a stateless fake for
 * development, tests and the demo (`fake-payment-gateway.ts`). Card, UPI and bank details
 * go to the gateway only; the platform keeps the gateway's reference ids.
 */

/** KYC for a creator's payout account; passed straight to the gateway, never stored. */
export interface PayoutAccountDetails {
  readonly email: string;
  readonly phone: string;
  readonly legalName: string;
  readonly pan: string;
  readonly accountHolderName: string;
  readonly accountNumber: string;
  readonly ifsc: string;
  /** Our reference for the gateway's records (the creator profile id). */
  readonly reference: string;
}

/** What the browser needs to take the payment. */
export type CheckoutSession =
  | { readonly kind: 'razorpay'; readonly keyId: string; readonly orderId: string }
  /** The fake gateway "pays" at once; this is the confirmation a real checkout would return. */
  | {
      readonly kind: 'fake';
      readonly orderId: string;
      readonly paymentId: string;
      readonly signature: string;
    };

export interface HeldOrderInput {
  /** What the brand pays: the creator's amount plus the processing fee. */
  readonly chargedMinor: number;
  /** What is held for the creator, released on approval. */
  readonly transferMinor: number;
  readonly currencyCode: string;
  readonly payoutAccountId: string;
  /** Our reference (the deal id), unique per deal. */
  readonly receipt: string;
}

export interface CheckoutConfirmation {
  readonly orderId: string;
  readonly paymentId: string;
  readonly signature: string;
}

/** A webhook as read: not signed by the gateway, not one we use, or a captured payment. */
export type WebhookEvent =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ignored' }
  | { readonly kind: 'captured'; readonly orderId: string; readonly paymentId: string };

export type PaymentGatewayErrorKind = 'REJECTED' | 'TRANSIENT';

/** REJECTED: the gateway refused (bad details, KYC); TRANSIENT: retry later. */
export class PaymentGatewayError extends Error {
  constructor(
    readonly kind: PaymentGatewayErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentGatewayError';
  }
}

export interface PaymentGateway {
  readonly name: 'razorpay' | 'fake';
  /** Creates the creator's payout (linked) account. Throws PaymentGatewayError. */
  createPayoutAccount(details: PayoutAccountDetails): Promise<{ readonly accountId: string }>;
  /** Creates an order whose transfer to the creator is held until released. */
  createHeldOrder(input: HeldOrderInput): Promise<CheckoutSession>;
  /** True when the checkout's confirmation was signed by the gateway for this order. */
  isCheckoutSignatureValid(confirmation: CheckoutConfirmation): boolean;
  /** Checks a webhook's signature and reads the captured payment from it, if it is one. */
  readWebhook(rawBody: string, signature: string): WebhookEvent;
  /** The held transfer created when the payment was captured. Safe to call again. */
  findHeldTransfer(paymentId: string): Promise<string | null>;
  /** Pays the held transfer out to the creator. Safe to call again. */
  releaseTransfer(transferId: string): Promise<void>;
  /** Refunds `amountMinor` to the brand and takes back the held transfer. */
  refundPayment(paymentId: string, amountMinor: number): Promise<void>;
}
