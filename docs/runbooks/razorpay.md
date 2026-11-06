# Switching on escrow payments with Razorpay (ADR-013)

Escrow is off until these steps are done (`PAYMENTS_MODE=off`: brands pay creators
directly). It needs a registered business, because Razorpay only activates Route for
companies that have completed KYC.

## 1. Razorpay account (once)

1. Sign up at razorpay.com with the company's details and complete KYC.
2. Ask Razorpay to activate **Route** and to allow **transfers on hold**. Confirm with them
   which linked-account details they need for individual creators (Q-48).
3. Settings → Payment capture: **automatic capture** on.

## 2. Test mode first

1. In **Test mode**, Settings → API Keys → generate a key pair.
2. Settings → Webhooks → add `https://<your domain>/api/payments/webhook`, choose a secret,
   and tick the events **payment.captured** and **order.paid**.
3. Set, in the secrets manager (or `.env` locally):

   ```
   PAYMENTS_MODE=razorpay
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=<the webhook secret>
   ```

4. Run one deal end to end with Razorpay's test cards and test bank accounts: creator sets up
   payouts, brand pays in, creator submits work, brand approves. Check in the Razorpay
   dashboard that the transfer was held, then released. Also try a cancellation before any
   work (refund) and a dispute settled by an admin.

## 3. Live

Repeat step 2 with live keys and a live webhook. Deals created **before** the switch stay
"paid directly"; new deals use escrow.

## If something goes wrong

- A release or refund the gateway couldn't finish shows as "Being paid out" / "Being
  refunded"; the hourly `deals.settle-escrow` job retries it. Its last error is in the
  `DealPayment.lastError` column and the worker log (`module: escrow`).
- Forged or mis-signed webhooks are refused (401) and logged as
  `payment.webhook-signature-rejected` in the audit log.
