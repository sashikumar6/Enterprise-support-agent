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

Status: **PENDING** as of 2026-08-14.

- [ ] Stripe-hosted test checkout returns to Scout.
- [ ] Verified `checkout.session.completed` event is applied exactly once.
- [ ] Checkout becomes `succeeded` and reservation becomes `confirmed`.
- [ ] Demo receipt persists after reload and states that no real ticket was issued.
- [ ] Explicit cancellation creates a Stripe test refund.
- [ ] Verified refund event advances the reservation to `cancelled`.
- [ ] Replayed webhook is a safe no-op.
- [ ] Database inspection confirms no raw card or sensitive payment data is stored.

Do not mark Phase 5 complete or begin Phase 6 until every live item above has evidence.
