# Scout release and rollback runbook

This runbook preserves Scout's $0, sandbox-only, and environment-isolation constraints. Commands
assume Node.js 22+, an authenticated Wrangler session, and secrets already stored through
Cloudflare. Never paste a secret into a command history, issue, screenshot, or documentation.

## Release inventory

| Environment | Worker             | D1                 | Application mode |
| ----------- | ------------------ | ------------------ | ---------------- |
| Preview     | `scout-preview`    | `scout-preview`    | `preview`        |
| Production  | `scout-production` | `scout-production` | `production`     |

Required secret names in each Cloudflare environment:

- `TICKETMASTER_API_KEY`
- `STRIPE_SECRET_KEY` (test mode only)
- `STRIPE_WEBHOOK_SECRET` (endpoint-specific)
- `OPS_ACCESS_TOKEN`

## Preflight

1. Confirm Cloudflare remains on Workers Free and Stripe is in test mode.
2. Confirm `git status --short` contains only intended release changes.
3. Run `npm ci`, `npm run migrate:local`, `npm run check`, and `npm run test:e2e`.
4. Run `npm audit --audit-level=high`; review rather than suppress any exception.
5. Run `npm run security:secrets` after generating final docs and screenshots.

## Preview promotion

```sh
npm run migrate:preview
npm run deploy:preview
SCOUT_RELEASE_URL=https://scout-preview.veeravaagu-vishal.workers.dev npm run test:release
```

Complete the live/fixture, AI failure, voice fallback, operations, and Stripe test-mode checklist in
`docs/RELEASE_ACCEPTANCE.md`. Record the deployed Worker version before production promotion.

## Production promotion

Production D1 must be empty except for migration metadata before first use. Do not export or copy
preview rows.

```sh
npm run migrate:production
npm run deploy:production
SCOUT_RELEASE_URL=https://scout-production.veeravaagu-vishal.workers.dev npm run test:release
```

After smoke tests, run one bounded live Ticketmaster search, one labeled fixture search, one AI
fallback request, and the Stripe test checkout/webhook/refund path. Compare the operations
correlation with production D1 facts without exposing the operator token.

## Application rollback

Migrations are forward-only; do not delete or reverse production data during an application
rollback. List deployments, choose the last known-good version recorded in acceptance evidence,
then explicitly roll back and smoke-test:

```sh
npx wrangler deployments list --env production
npx wrangler rollback <known-good-version-id> --env production --message "release rollback" --yes
SCOUT_RELEASE_URL=https://scout-production.veeravaagu-vishal.workers.dev npm run test:release
```

Rollback is complete only when public HTML, health/readiness, security headers, fixture discovery,
and unauthorized operations checks pass. Record both version IDs and the reason.

## Failure procedures

- **Readiness or migration failure:** stop promotion. Do not retry a partially understood schema
  change. Inspect migration history and D1 backup/time-travel options before a forward fix.
- **Ticketmaster/Workers AI outage:** leave visible fixture/deterministic fallback enabled. Do not
  rotate valid credentials or enable paid quota merely to clear an outage.
- **Stripe failure:** disable the checkout path by removing/rotating the production test secret if
  necessary; existing plans remain drafts. Browser redirects never prove payment.
- **Suspected credential exposure:** rotate the affected provider secret and operations token,
  invalidate webhook endpoints where applicable, inspect allowlisted logs, and redeploy.
- **Bad static release:** roll back the Worker version; D1 remains unchanged.
- **Rate-limit regression:** roll back code/config together and verify `Retry-After` plus normal
  recovery. Rate-limit counters are permissive abuse controls, not billing/accounting records.
