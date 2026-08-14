# Phase 4 durable plans acceptance

Phase 4 is complete when a selected normalized event can be preserved as an owned,
durable draft without implying that Scout reserved a ticket or accepted payment.

## Delivered behavior

- `GET /api/v1/plans` creates or resolves a guest browser session and returns only that
  session's plans.
- `POST /api/v1/plans` validates a normalized event and an idempotency key before any
  persistence operation.
- Guest credentials are random opaque values stored only in an HttpOnly, SameSite cookie.
  D1 stores a SHA-256 token hash, not the cookie value.
- A save stores the complete observed event and ranking evidence in an immutable event
  snapshot. Historical plans are not silently refreshed from a provider.
- Draft creation batches the snapshot, reservation, initial transition, and audit event.
- Repeating the same owner/idempotency-key pair returns the existing plan rather than
  creating a second draft.
- My Plans survives a reload and labels each item `Draft · no payment`. The UI explicitly
  says that a draft is not a reservation, ticket, or purchase.

## Persistence contract

Migration `0002_durable_plans.sql` adds the minimum Phase 4 entities:

- `users` and `sessions`
- `event_snapshots`
- `reservations`
- `checkouts`
- `payment_events`
- `reservation_transitions`

The existing `audit_events` table records draft creation. Foreign keys, state checks,
non-negative versions, unique idempotency/provider-event constraints, and an update-blocking
trigger for event snapshots enforce the durable boundaries in D1. Checkout and payment rows
are modeled for the next phase but are not created by the Phase 4 API.

## State-machine contract

Pure domain functions define the allowed transitions:

```text
checkout:     created -> pending -> succeeded | failed | expired
              created -> expired

reservation: draft -> payment_pending -> confirmed
             confirmed -> cancellation_pending -> cancelled
             payment_pending -> draft
             cancellation_pending -> confirmed
```

Each command carries an operation ID and expected version. A previously applied operation is
a safe replay; a stale expected version is a conflict; and an unlisted edge is invalid. Phase
5 will connect verified Stripe events to these domain rules and version-predicated D1 writes.

## Verification evidence

| Check                          | Result                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| Format and lint                | Pass                                                          |
| TypeScript project build       | Pass                                                          |
| Spike and application tests    | 28 pass                                                       |
| State transitions              | Valid, invalid, replay, and stale-version cases pass          |
| Plans API                      | Creation, replay, validation, and cross-owner isolation pass  |
| Worker/client production build | Pass                                                          |
| Local D1 migration             | `0002_durable_plans.sql` applied; 15 commands pass            |
| Desktop browser                | Search, save, reload, and restored draft pass                 |
| Mobile browser                 | Search, save, reload, and restored draft pass                 |
| Visual review                  | Empty My Plans layout and trust labeling fit responsive shell |

No Stripe object, real charge, provider reservation, or Ticketmaster ticket is created in
this phase.
