# ADR-012: Deal contracts and work review (escrow phase 1)

**Status:** accepted · 2026-11-06

## Context

The product owner asked for "Brand-Creator Contract + Payment Escrow Lite": create a deal,
generate or upload a contract, hold the payment (Razorpay), creator submits proof of work,
brand approves or asks for changes, payment is released, deal history. Holding money
between two parties in India needs a registered business and a regulated escrow or
payment-aggregator account, and the spec lists in-app payments as "Later, after company
registration" (FR-9.6). So the work is split: **phase 1** (this ADR) adds everything except
holding money; **phase 2** puts a `PaymentGateway` interface (Razorpay, plus a fake for tests)
in front of the same approve step once the company and gateway account exist.

## Decision

- **Status flow:** accepted → work submitted ⇄ changes requested → work approved →
  payment marked → completed (or cancelled). "Posted" is renamed "approved" in place
  (`ALTER TYPE … RENAME VALUE`), so existing posted deals continue as approved. Adding a
  post link no longer changes the status; it only feeds the campaign report.
- **Contract:** the brand's "issue contract" form sets the amount and payment terms and
  creates a new `DealContract` version: the standard clauses (i18n, `templateVersion`) or
  the brand's own PDF (scanned, private, each version keeps its own copy), with the key
  terms snapshotted in `terms`. Issuing is the brand's acceptance; the creator accepts the
  exact version by its SHA-256 **fingerprint** (terms + extra text + file hash). Terms can
  change only while the work is with the creator; each change is a new version to accept.
- **Proof of work:** links and/or up to 5 images or PDFs (10 MB in all, scanned), only
  under a contract both sides accepted (re-checked inside the transaction after the deal
  row is locked, so a concurrent new version can't slip through).
- **Review:** the brand approves or asks for changes (at most **2** rounds, stored in the
  contract); work not reviewed within **7 days** is approved automatically by an hourly job,
  so a brand can't stall a creator. Payment falls due from approval (7 days unless a date
  was agreed). Either side can raise a dispute, which becomes an admin report (`DEAL`).
- **Deletion:** contracts, acceptances and submissions are shared deal records: the other
  side keeps them; the deleted person's user links are cleared (side and time remain).

## Consequences

- Phase 1 holds no money, so disputes don't pause auto-approval yet; phase 2 freezes the
  held payment during a dispute and adds release and refund (cancellation rules: full refund
  before work is submitted, otherwise mutual agreement or an admin decision).
- The standard clauses are a draft until a lawyer reviews them (X-03); changing their text
  needs a new `DEAL_CONTRACT.templateVersion`.
- Phase 2 adds Razorpay as a processor (privacy notice, `processors.md`) and gateway
  references only: no card, UPI or bank details are stored by the platform.
