# ADR-013: Escrow with Razorpay Route (escrow phase 2)

**Status:** accepted · 2026-11-06 · switched on only when `PAYMENTS_MODE=razorpay`

## Context

ADR-012 added contracts and work review with direct payment. The product owner wants the
brand's money held until the work is approved. The platform must not hold money itself
(that needs a regulated escrow or payment-aggregator account), must not store card, UPI or
bank details, and the company and Razorpay account are still being registered (X-08).

## Decision

- **Gateway behind an interface** (`adapters/payments`): Razorpay Route, plus a stateless
  fake for development, tests and the demo. `PAYMENTS_MODE` is `off` (direct payment, the
  pilot), `fake` (development only) or `razorpay`. Each deal records its `paymentMethod`
  when it is created, so switching modes never strands a funded deal.
- **Creator payout account:** a pass-through KYC form (legal name, PAN, mobile, bank
  account, IFSC) creates a Razorpay linked account. We keep only its id and the account's
  last 4 digits; nothing else is stored or logged.
- **Funding:** after the contract is signed, the brand pays the contract amount plus a
  processing fee (2.36%: Razorpay ~2% + GST) in Razorpay Checkout. The order carries a
  transfer to the creator's account **on hold**. The payment counts once its signature is
  verified, from the browser's checkout or a signed webhook (whichever comes first).
- **Rules:** work can be submitted only once the payment is held; the amount is then fixed;
  approval or automatic approval releases the transfer and completes the deal; cancelling
  before any work is submitted refunds the brand (fee kept); after that, a dispute freezes
  the payment and an admin releases or refunds it. Escrow deals are never marked paid by hand.
- **Robustness:** gateway calls have timeouts and retries; a release or refund that fails
  stays pending and an hourly job retries it; refunds check for an existing refund first.

## Consequences

- Before going live: verify the adapter in Razorpay test mode (linked-account fields, Q-48),
  set the webhook (`/api/payments/webhook`, events `payment.captured`, `order.paid`), turn
  on automatic capture, and list Razorpay in the privacy notice (X-03).
- Tax treatment (e.g. TDS under section 194-O for e-commerce operators, GST on the fee) is
  for the company's CA to confirm (Q-47).
- Advance payments aren't supported with escrow (the whole amount is held); direct deals
  keep them.
