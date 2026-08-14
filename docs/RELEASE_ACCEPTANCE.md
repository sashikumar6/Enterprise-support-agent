# Phase 9 production hardening and public release acceptance

Status: **VERIFIED COMPLETE**

Date started: 2026-08-14
Last updated: 2026-08-14

Phase 9 is complete only when a reviewer can use the public deployment and reproduce the
repository without private help. A successful deploy or screenshot alone is not acceptance.
Preview and production must use separate data and secrets; no private preview data may be copied
to production.

## Requirement-to-evidence matrix

| Requirement                 | Normal evidence                                                                                                                                                          | Paired failure/boundary evidence                                                                                                         | Status   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Accessibility               | Desktop and mobile keyboard journey; landmarks, labels, visible focus, skip link, status announcements, and contrast review                                              | Validation, loading, empty, provider failure, disabled controls, reduced motion, and 320 px layout                                       | Verified |
| Responsive behavior         | Deployed desktop and mobile golden-path review with no horizontal overflow                                                                                               | 320 px viewport, long provider text, missing images/data, operations timeline, and confirmation cards                                    | Verified |
| Abuse controls              | Session/user limits for search, AI, speech, lifecycle writes, checkout, and operations login; bounded provider calls                                                     | Burst, spoofed/missing session identifier, isolate restart, replay, oversized body, and 429 recovery                                     | Verified |
| Security and threat model   | Same-origin APIs, security headers, strict validation, ownership checks, signed webhooks, redacted telemetry                                                             | Prompt/tool abuse, CSRF/origin failure, unauthorized owner/operator, secret/log scan, dependency audit, and hostile provider text        | Verified |
| Secret handling             | Preview and production secret-name inventory; no secret in source, bundle, logs, screenshots, or docs                                                                    | Missing/invalid secret fails closed and secret scan checks tracked plus untracked release files                                          | Verified |
| Environment isolation       | Distinct preview and production Worker names, D1 IDs, environment labels, secrets, and migration history                                                                 | Production cannot bind preview D1 or copy guest/operator/payment data; misbinding is caught before deploy                                | Verified |
| Deployment smoke            | Versioned command checks public HTML, health/readiness, headers, static assets, desktop/mobile UI, and safe fixture journey                                              | Readiness failure, provider/AI failure, unknown API route, unauthorized operations, and stale asset/version detection                    | Verified |
| Migrations                  | Clean database applies every ordered migration before deployment and readiness passes                                                                                    | Reapply is safe; missing migration prevents promotion; rollback documents forward-only data handling                                     | Verified |
| Rollback/runbook            | Previously known-good Worker version can be restored and smoke-tested without changing D1 data                                                                           | Failed deploy, failed migration, provider outage, and compromised-secret procedures are rehearsed                                        | Verified |
| Clean-clone reproducibility | Fresh checkout completes `npm ci`, local migration, quality gates, browser suite, and documented demo                                                                    | No provider accounts/secrets: fixture and deterministic fallback still work                                                              | Verified |
| Complete golden path        | Public typed and voice discovery, live facts, explicit confirmation, Stripe test webhook, durable receipt, refund, lifecycle alert, and protected operations correlation | Live/fixture, AI enabled/disabled, payment success/failure/replay, owner/non-owner, status changed/unchanged, and speech success/failure | Verified |
| Release documentation       | Architecture/limitations, seeded demo, recruiter script, screenshots, README, runbook, and truthful resume bullets match deployed behavior                               | Claims audit rejects real-ticket, real-charge, arbitrary-location, staffed-support, SLA, or unused-technology claims                     | Verified |

## Initial deployed-preview baseline

Read-only checks ran against `https://scout-preview.veeravaagu-vishal.workers.dev` before any
Phase 9 release configuration change:

- Public HTML returned HTTP 200 and identified Scout as a New York governed events concierge.
- `/api/v1/health` returned HTTP 200 with a correlation ID.
- The HTML declared English language, a responsive viewport, title/description metadata, PWA
  manifest, icon, and social preview metadata.
- Cloudflare supplied its normal cache and edge headers, but the HTML and health responses did not
  yet include Scout-defined CSP, frame, content-type, referrer, or permissions policies. This is a
  failing security-header baseline.
- Source review confirmed semantic navigation, a main landmark, labeled forms, live regions, and
  visible `:focus-visible` styles, but no skip-to-content link. This is a failing keyboard baseline.
- The installed in-app browser controllers were unavailable in this session. Deployed visual and
  keyboard acceptance remains pending; it must be run with the repository preview smoke suite and
  manually reviewed before Phase 9 can close.

## Phase 9 first hardening slice

- Add matching security headers to Cloudflare static assets and Worker API responses.
- Add a keyboard-visible skip link targeting the main landmark.
- Add a read-only, desktop/mobile deployment smoke configuration that accepts an explicit target
  URL and never silently falls back to localhost.
- Keep the existing preview deployment and privacy-hardened observability settings unchanged until
  the local quality gate passes and the owner authorizes production resource creation/promotion.

### Local verification

- `npm run check` passed formatting, lint, TypeScript, the 97-file secret scan, 102 automated tests,
  the React production build, and the Worker deployment dry run.
- `npm run test:e2e` passed all 10 existing desktop/mobile journeys.
- `SCOUT_PREVIEW_URL=http://127.0.0.1:8788 npm run test:preview` passed four desktop/mobile smoke
  checks against the built local Worker: public shell, skip navigation, no horizontal overflow,
  health/readiness, static/API security headers, and unauthorized operations access.
- Wrangler parsed the static `_headers` rule and served the expected assets locally. The same
  behavior was subsequently proven on the authorized preview deployment.

### Deployed preview verification

- Worker `scout-preview` version `6102dfea-8350-41ee-aef8-e8b15731bddd` deployed successfully to
  `https://scout-preview.veeravaagu-vishal.workers.dev` with the existing preview D1, AI binding,
  secrets, and privacy-hardened observability configuration. No production resource was created or
  changed.
- `SCOUT_PREVIEW_URL=https://scout-preview.veeravaagu-vishal.workers.dev npm run test:preview`
  passed all four desktop/mobile checks in 1.8 seconds.
- The deployed shell passed title, disclosure, main-landmark, first-tab skip-link, skip-target, and
  horizontal-overflow checks in Desktop Chrome and Pixel 7 profiles.
- Full-page deployed captures were visually inspected at Desktop Chrome and Pixel 7 dimensions.
  The hero, concierge controls, exact-filter form, plans, lifecycle forms, protected operations
  entry, trust disclosures, and footer remain readable without overlap or horizontal clipping.
  Source review also confirms the reduced-motion rule disables smooth scrolling and card motion.
- The deployed health and readiness APIs returned healthy responses, while unauthenticated
  operations access returned HTTP 401.
- Direct edge inspection confirmed CSP, Permissions Policy, Referrer Policy,
  `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` on HTML and API responses. The shell
  permits microphone use only from itself; API responses disable microphone access.

## Abuse-control and migration evidence

- Costly public work is limited to 10 requests per 60 seconds, state-changing work to 12, and
  operator authentication to 5. Release identities come from the server-owned guest cookie;
  spoofed client session headers do not select a limiter identity.
- Cloudflare's edge binding is a fast first layer. Because that binding is intentionally
  eventually consistent, release environments also use an atomic D1 window keyed by a SHA-256
  actor digest. Raw session identifiers and IP addresses are not stored in the limiter table.
- A live preview burst initially demonstrated the edge binding's documented permissive behavior.
  After adding the D1 layer, the same isolated-cookie test returned HTTP 200 for requests 1–10 and
  HTTP 429 with `Retry-After: 60` for request 11.
- Automated boundaries cover spoofed identities, missing identities, oversized request bodies,
  cross-origin mutations, the precise threshold, and recovery metadata. Provider work happens only
  after the limiter succeeds.
- Migration `0007_release_rate_limits.sql` applied to local, preview, and the empty production D1.
  Wrangler subsequently reported no migrations remaining in all three environments.

## Current regression evidence

- `npm run check`: pass; formatting, lint, TypeScript, secret scan over 104 files, 105 tests, web
  build, and Worker dry run all succeeded.
- `npm run test:e2e`: 10/10 desktop and mobile journeys passed.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Preview Worker version `9a4240cb-e9e2-4577-aee4-fc1a9bd47c53` deployed with separate preview D1,
  AI, and three rate-limit bindings.
- `SCOUT_RELEASE_URL=https://scout-preview.veeravaagu-vishal.workers.dev npm run test:release`:
  4/4 deployed desktop/mobile shell, readiness, security-header, and unauthorized-operations checks
  passed.
- Production D1 `scout-production` exists separately and contains only schema migrations. The
  production Worker and provider secrets were subsequently promoted without copying preview data.

## Production release evidence

- Public URL: `https://scout-production.veeravaagu-vishal.workers.dev`.
- Accepted Worker version: `eefba0f6-9fff-4673-b5af-5d0a03a75fd8`, bound to
  `scout-production`, `APP_ENV=production`, Workers AI, and production-only rate-limit namespaces.
- Production uses an endpoint-specific Stripe test webhook and Cloudflare environment secrets.
  Values were streamed directly from the ignored local secret file and never printed, committed,
  documented, or placed in screenshots.
- The production desktop/mobile release suite passed 4/4 before and after rollback. Final full-page
  captures are `docs/screenshots/scout-production-desktop.png` and
  `docs/screenshots/scout-production-mobile.png`; visual review found no overlap or horizontal
  clipping, including the 412 px mobile layout.
- A bounded live Ticketmaster request returned 12 New York records in `live` mode without fallback.
  A governed conversation resolved next Friday to 2026-08-21, used Workers AI, and invoked exactly
  one read-only search tool.
- Production TTS returned `audio/mpeg` with `Cache-Control: no-store`. Round-tripping that output
  through production transcription returned an editable transcript and
  `rawAudioPersisted: false`.
- Protected production operations rejected public access in the smoke suite, then accepted the
  configured operator credential and returned a stored summary.
- The opt-in production golden-path browser test passed in 13.2 seconds: labeled fixture search,
  owned draft, explicit checkout confirmation, Stripe test card, signed webhook, durable demo
  receipt, no-ticket disclosure, explicit cancellation, refund webhook, and terminal cancelled
  state.
- Aggregate D1 inspection found three completed test journeys: three cancelled reservations, three
  succeeded/refunded checkouts, three applied checkout events, three applied refund events, and
  three safely rejected equivalent terminal refund events. Six intentionally abandoned selector-
  debugging sessions remain payment-pending and produced no confirmed reservation or charge.

## Rollback evidence

- Deployed identical drill version `007e2e98-9b74-46e7-97d3-979c70396749`, then used Wrangler's
  version rollback to restore accepted version `eefba0f6-9fff-4673-b5af-5d0a03a75fd8` to 100% of
  traffic.
- Wrangler explicitly left D1 and other bound resources unchanged. The post-rollback production
  release suite passed 4/4 in 1.8 seconds.
- `docs/RELEASE_RUNBOOK.md` covers forward-only migration handling, failed readiness, provider/AI
  outage, Stripe failure, credential exposure, bad static releases, and limiter regressions.

## Clean-clone evidence

- Release candidate commit `31a83ec` was cloned with `--no-local` into a new temporary directory.
  The clone had no existing `node_modules`, local D1 state, or provider secret files.
- `npm ci` installed 256 packages and reported zero vulnerabilities.
- `npm run migrate:local` applied migrations `0001` through `0007` in order to the new local D1.
- `npm run check` passed formatting, lint, TypeScript, the secret scan, 105 tests, and both
  production builds.
- `npm run test:e2e` passed all 10 desktop/mobile fixture and operations journeys in 13.9 seconds.

## Final result

Phase 9 is **VERIFIED COMPLETE** on 2026-08-14. The public production URL, isolated deployment,
governed golden path, deterministic abuse ceiling, rollback, documentation, screenshots, and
clean-clone reproduction all passed their paired acceptance gates. The product remains explicitly
New York-only, test-payment-only, and a feasibility portfolio application.
