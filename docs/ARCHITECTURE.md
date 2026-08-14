# Scout architecture and limitations

Scout is a TypeScript modular monolith deployed as one Cloudflare Worker. React static assets and
the versioned Hono API share one origin. Domain and application code stays provider-neutral;
Cloudflare D1, Workers AI, Ticketmaster, and Stripe are adapters at the runtime edge.

The editable system diagram is [scout-architecture.excalidraw](scout-architecture.excalidraw).

## Request and authority flow

1. The browser submits typed constraints or a consented voice clip.
2. The API validates size, origin, rate limit, ownership, and schema before provider work.
3. Workers AI may extract intent and select the read-only `search_events` tool.
4. Deterministic code resolves New York dates/times, filters provider facts, scores, and groups
   results. The model cannot invent events, prices, availability, payment, or reservation state.
5. D1 stores guest-owned snapshots, preferences, alerts, audit history, and operations records.
6. Consequential actions require an explicit UI confirmation. Stripe test-mode webhooks, not
   browser redirects, advance payment and reservation state.

## Deployment boundaries

| Environment | Worker                   | Database           | Purpose                                    |
| ----------- | ------------------------ | ------------------ | ------------------------------------------ |
| Local       | `scout` via Wrangler dev | `scout-local`      | Account-free fixture development and tests |
| Preview     | `scout-preview`          | `scout-preview`    | Provider and release-candidate acceptance  |
| Production  | `scout-production`       | `scout-production` | Public portfolio URL                       |

Bindings and secrets are declared separately for preview and production. Production starts with an
empty database; preview guest, operations, payment, and audit rows are never copied into it.

## Trust boundaries

- Guest identity is an opaque HttpOnly cookie whose SHA-256 hash is stored in D1.
- Cloudflare rate-limit bindings use server-owned guest identity for costly and state-changing
  routes. Operations login has a separate limiter. Because the edge binding is eventually
  consistent, preview and production also enforce an atomic D1 minute window keyed only by a
  SHA-256 actor digest. Local fallback counters exist for development and deterministic tests.
- Cross-origin browser mutations are rejected; Stripe webhook requests are instead protected by
  timestamp-bounded signature verification and idempotency.
- Static and API responses set CSP, frame, content-type, referrer, and permissions policies.
- Operations access uses a server secret and a short-lived signed HttpOnly cookie.
- Application logs and stored operations metadata are allowlisted. Prompts, transcripts, audio,
  cookies, credentials, and card data are excluded.

## Honest limitations

- Scout supports New York City only. It does not search arbitrary Ticketmaster markets.
- Ticketmaster Discovery supplies real event records, not guaranteed seats, remaining inventory,
  final fees, or purchase fulfillment. Price data is optional and non-authoritative.
- Stripe is test mode only. The fixed $1 demonstration amount is unrelated to provider pricing.
  Scout never creates a real charge or Ticketmaster ticket.
- Voice is turn-based and quota-bound. Raw audio is not persisted; typed interaction remains the
  fallback.
- Fixture mode is seeded, deterministic demo data and is always labeled as such.
- Help requests are inspectable records; no staffed support team is contacted.
- Cloudflare free tiers have quotas, short telemetry retention, and no commercial SLA. Quota or
  provider failure degrades visibly instead of enabling billing or inventing facts.
- The deployment is a feasibility portfolio application, not a commercial ticket marketplace.

## Replacement path

Provider interfaces allow commercial inventory/order services, a contracted model provider,
managed PostgreSQL, and durable observability to replace portfolio adapters. Those replacements
would still require contracts, tax/fee correctness, fraud controls, privacy policy, support,
backups, incident response, accessibility/legal review, and service-level objectives.
