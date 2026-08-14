# Phase 5 Stripe sandbox acceptance

Phase 5 is complete only when a Stripe test-mode payment drives an owned draft through a
signature-verified webhook into a durable demo reservation, and the simulated cancellation
and refund path also completes without implying a real Ticketmaster purchase.

## Delivered implementation

- Provider-neutral payment contract and Stripe sandbox adapter
- Stripe-hosted fixed $1.00 test Checkout Session
- Explicit two-step confirmation before checkout and cancellation
- Owner checks and idempotency for checkout and refund requests
- Timestamp-bounded HMAC webhook verification using the raw request body
- Atomic D1 checkout, payment-event, reservation-transition, and audit updates
- Duplicate replay and out-of-order terminal-event handling
- Pending, confirmed, cancellation, cancelled, and persistent demo-receipt UI
- Ignored local Wrangler secrets with name-only example files

## Automated evidence

| Check                          | Result                                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| Format and lint                | Pass                                                                  |
| TypeScript project build       | Pass                                                                  |
| Secret scan                    | Pass                                                                  |
| Spike and application tests    | 41 pass                                                               |
| Stripe adapter                 | Checkout, webhook signature, forged signature, and refund tests pass  |
| Commerce APIs                  | Confirmation, ownership, replay, webhook, and cancellation tests pass |
| D1 migrations                  | `0003` and `0004` apply locally                                       |
| Worker/client production build | Pass                                                                  |

## Live sandbox evidence

Status: **VERIFIED COMPLETE** on 2026-08-14.

- [x] Stripe-hosted test checkout returns to Scout.
- [x] Verified `checkout.session.completed` event is applied exactly once.
- [x] Checkout becomes `succeeded` and reservation becomes `confirmed`.
- [x] Demo receipt persists after reload and states that no real ticket was issued.
- [x] Explicit cancellation creates a Stripe test refund.
- [x] Verified refund event advances the reservation to `cancelled`.
- [x] Replayed webhook is a safe no-op.
- [x] Database inspection confirms no raw card or sensitive payment data is stored.

Live evidence: Stripe Checkout accepted the documented `4242` test card after its test-mode
verification step. The CLI listener delivered `refund.created` and `refund.updated` to the local
signature-verified endpoint, and Scout returned HTTP 200 for both. The browser showed the durable
demo receipt after reload, including the no-ticket disclosure, and later showed
`Cancelled · test refund complete` after reload.

Local D1 inspection confirmed the tested reservation is `cancelled`, its checkout and refund are
both `succeeded`, the amount is 100 USD minor units, and Stripe checkout, payment, and refund IDs
are present. The transition history is `draft` -> `payment_pending` -> `confirmed` ->
`cancellation_pending` -> `cancelled`. One refund terminal event applied and the second equivalent
terminal event was rejected without changing state. Replaying the identical signed checkout event
again returned HTTP 200 without adding another payment-event record. The schema and stored record
contain provider identifiers only—no raw card number, CVC, or other sensitive payment data.
