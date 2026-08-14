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

Node.js 22 or newer is required. Anyone can clone this public repository and run the exact same
app locally — no relationship to this project, and no Cloudflare account or provider secret, is
required for the fixture journey.

```sh
git clone git@github.com:sashikumar6/Enterprise-support-agent.git
# or, if you don't have an SSH key registered with GitHub:
# git clone https://github.com/sashikumar6/Enterprise-support-agent.git
cd Enterprise-support-agent

npm ci
npm run migrate:local
npm run dev
```

Open `http://127.0.0.1:8787`. Choose **Demo fixtures only** for a repeatable, quota-free search.
Optional provider values belong in ignored `.dev.vars`/`.env.local` files; never commit them.

### Troubleshooting a fresh clone

- **`git@github.com: Permission denied (publickey)` on clone** — this is a public repository, so
  SSH access has nothing to do with permissions on this project; GitHub still requires *some*
  SSH key on file for `git@github.com` clones. Either add an SSH key to your own GitHub account
  ([docs](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)), or use the
  HTTPS clone URL above, which works anonymously with no key or account.
- **`npm ci` fails on Node version** — check `node -v`; this project requires Node 22+ (`nvm install 22`
  works if you use nvm).
- **`wrangler dev` asks you to log in** — it shouldn't for the default `npm run dev` flow above,
  which only touches the local, on-disk D1 database (`database_id = "local-development"` in
  `wrangler.toml`) and needs no Cloudflare account. If you see a login prompt, you likely ran
  `npm run dev:ai` (Workers AI) or a `deploy:*`/`migrate:preview`/`migrate:production` script —
  those intentionally talk to a real Cloudflare account.
- **Live Ticketmaster/Stripe data instead of fixtures** — copy `.dev.vars.example` to `.dev.vars`
  and fill in your *own* `TICKETMASTER_API_KEY`, `STRIPE_SECRET_KEY` (test-mode), and
  `STRIPE_WEBHOOK_SECRET`. These are per-developer secrets, intentionally excluded from git, and
  ours won't work for you.
- **Conversational search always falls back** ("Conversational search is unavailable right now")
  — this is expected on plain `npm run dev`. Workers AI is only bound when you run
  `npm run dev:ai`, which requires `wrangler login` against your own Cloudflare account (Workers AI
  has no fully-offline local emulation).
- **Deploying your own preview/production copy** — `wrangler.toml`'s `[env.preview]` and
  `[env.production]` blocks hardcode D1 `database_id`s and rate-limit `namespace_id`s that belong
  to this project's Cloudflare account; you cannot deploy against them from another account. To
  host your own copy, run `wrangler login`, create your own resources
  (`wrangler d1 create scout-preview`, etc.), and swap the resulting IDs into your own
  `wrangler.toml` before running `npm run deploy:preview` / `deploy:production`.

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
