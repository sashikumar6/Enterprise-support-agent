# Scout

Scout is a production-shaped consumer AI events concierge. It will accept typed or
push-to-talk requests, turn natural-language preferences into recommendations from live event
data, require confirmation before actions, simulate checkout through Stripe test mode, and
persist demo reservations.

The Ticketmaster data-quality spike selected New York as the launch city. The Phase 2
engineering foundation now provides a React shell, Hono Worker API, provider-neutral core,
local D1 migrations, tests, and CI. Phase 3 is deterministic live discovery.

Read [the complete project handoff](docs/PROJECT_HANDOFF.md) for product scope, architecture,
provider limitations, zero-cost constraints, implementation phases, and definition of done.

Important product boundary: live event discovery does not make Scout a real ticket issuer.
Checkout and reservations will be explicitly labeled simulations, and no real money or ticket
inventory will move.

## Ticketmaster data-quality spike

The Phase 1 spike runs without third-party dependencies:

```sh
npm test
npm run spike:ticketmaster
```

The live command reads `TICKETMASTER_API_KEY` from the ignored `.env.local` file and writes a
repeatable report plus normalized, sanitized samples to `reports/ticketmaster/`. It never logs
the key or stores raw provider responses.

The generated report is available at
[`reports/ticketmaster/data-quality-report.md`](reports/ticketmaster/data-quality-report.md).

## Local foundation

Node.js 22 or newer is required. No Cloudflare account or provider secret is needed for the
local foundation:

```sh
npm ci
npm run migrate:local
npm run dev
```

Open <http://127.0.0.1:8787>. The same Worker serves the responsive React shell and versioned
API. Useful checks:

```sh
curl http://127.0.0.1:8787/api/v1/health
curl http://127.0.0.1:8787/api/v1/readiness
npm run check
npm run test:e2e
```

The complete Phase 2 checks and environment inventory are in
[`docs/FOUNDATION_ACCEPTANCE.md`](docs/FOUNDATION_ACCEPTANCE.md). Architecture decisions live
in [`docs/adr`](docs/adr).
