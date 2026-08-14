# Scout

Scout is a production-shaped AI events concierge for New York City. A user can describe an
experience, search live Ticketmaster-indexed events, inspect deterministic ranking evidence, save a
durable plan, complete a clearly labeled Stripe test-mode checkout, and inspect the correlated
provider and audit timeline.

**Public release:** `https://scout-production.veeravaagu-vishal.workers.dev`
**Preview:** `https://scout-preview.veeravaagu-vishal.workers.dev`

Scout does not issue Ticketmaster tickets or charge real money. Ticketmaster Discovery data does
not guarantee remaining seats, final price, fees, or fulfillment. Stripe uses test mode and the
fixed $1 demo amount is unrelated to provider pricing.

## What it demonstrates

- Typed and turn-based voice discovery through one governed conversation path
- Live Ticketmaster facts plus clearly labeled deterministic fixtures
- New York date/time resolution, exact-time matching, explainable scoring, and result diversity
- Workers AI structured intent extraction with read-only tool authority and deterministic fallback
- Guest-owned D1 plans, immutable event snapshots, preferences, alerts, and help records
- Explicit confirmation, signed Stripe test webhooks, idempotency, demo receipts, and test refunds
- Protected operations summary/timeline with safe correlation, logs, traces, and provider health
- Server-owned Cloudflare rate limiting, origin/body-size controls, security headers, and secret scan
- Isolated preview/production Workers, D1 databases, secret stores, migrations, smoke tests, and
  rollback procedures

## Architecture

Scout is a TypeScript npm workspace and one deployable modular monolith:

- `apps/web` — React/Vite PWA
- `apps/worker` — Hono API and Cloudflare provider/persistence adapters
- `packages/core` — provider-neutral contracts, validation, ranking, orchestration, and state
  machines
- `migrations` — ordered D1 schema history

See [architecture and limitations](docs/ARCHITECTURE.md), the editable
[Excalidraw diagram](docs/scout-architecture.excalidraw), and the complete
[project handoff](docs/PROJECT_HANDOFF.md).

## Local development

Node.js 22 or newer is required. The fixture journey needs no Cloudflare account or provider
secret:

```sh
npm ci
npm run migrate:local
npm run dev
```

Open `http://127.0.0.1:8787`. Choose **Demo fixtures only** for a repeatable, quota-free search.
Optional provider values belong in ignored `.dev.vars`/`.env.local` files; never commit them.

## Verification

```sh
npm run check
npm run test:e2e
SCOUT_RELEASE_URL=https://scout-preview.veeravaagu-vishal.workers.dev npm run test:release
```

`npm run check` runs formatting, lint, TypeScript, secret scanning, unit/integration/provider tests,
and production builds. Playwright covers desktop and mobile journeys. The explicit-target release
suite checks public HTML, accessibility basics, overflow, readiness, security headers, and
unauthorized operations access without silently falling back to localhost.

## Deployment

Preview and production use separate Worker environments, D1 databases, rate-limit namespaces, and
Cloudflare secret stores. Production is initialized from migrations, never by copying preview
data.

Follow [the release and rollback runbook](docs/RELEASE_RUNBOOK.md). Phase-specific evidence is in
`docs/*_ACCEPTANCE.md`; [release acceptance](docs/RELEASE_ACCEPTANCE.md) is the final source for the
public build.

## Reviewer walkthrough

The [recruiter demo](docs/RECRUITER_DEMO.md) provides a short governed-discovery, fallback,
sandbox-action, lifecycle, operations, and architecture walkthrough plus truthful resume bullets.
Final production captures are available for
[desktop](docs/screenshots/scout-production-desktop.png) and
[mobile](docs/screenshots/scout-production-mobile.png) review.
