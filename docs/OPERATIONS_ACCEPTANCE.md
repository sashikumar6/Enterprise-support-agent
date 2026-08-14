# Phase 8 operations and observability acceptance

Status: **VERIFIED COMPLETE**

Date started: 2026-08-14
Last verified: 2026-08-14

Phase 8 is complete only when a reviewer can inspect real stored agent, provider, and transaction
behavior without gaining access to another guest's data or any secret. Fixture-only dashboard
cards are not acceptance evidence.

## Delivered implementation

- A server-only `OPS_ACCESS_TOKEN` boundary exchanges an operator credential for a one-hour,
  HMAC-signed, HttpOnly, SameSite=Strict session cookie. Missing configuration fails closed, and
  the credential is never included in the client bundle or an operations response.
- Protected D1-backed summary and timeline APIs expose reservation, checkout, payment, audit, tool,
  provider-health, transition, and payment-event facts.
- Tool/provider instrumentation records safe status, latency, failure category, correlation ID,
  and an allowlisted metadata subset for Ticketmaster, Workers AI, speech, Stripe, and lifecycle
  status checks. It does not store prompts, transcripts, raw audio, cookies, credentials, or card
  data.
- The responsive operations UI provides stored summary counts, freshness, a keyboard-usable
  correlation filter, explicit status badges, lock/unlock controls, and honest loading, error, and
  empty states.
- `0006_operations.sql` adds indexed tool-invocation history and correlation lookup for existing
  provider-health history.
- `wrangler.toml` enables persisted allowlisted application logs and traces at full sampling for
  the initial low-traffic deployment. Automatic invocation-log persistence is disabled because
  its raw request envelope can contain operator cookies. Phase 9 should reassess sampling after
  observing real traffic.

## Requirement-to-evidence matrix

| Requirement              | Evidence                                                                                                                                                                                                                                                                                                              | Status |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Operations access        | API tests cover missing, invalid, and unconfigured credentials; Playwright unlocks and relocks the protected surface on desktop and mobile.                                                                                                                                                                           | Pass   |
| Summary                  | Protected API returned 46 reservations, 2 checkouts, 3 payment events, 108 audit events, 49 tool calls, and 49 provider events; direct D1 returned the same counts.                                                                                                                                                   | Pass   |
| Tool timeline            | Unit/API cases distinguish completed, failed, and degraded outcomes; browser evidence renders real stored search tool records with duration and correlation.                                                                                                                                                          | Pass   |
| Provider/model health    | Ticketmaster fallback and Workers AI healthy/degraded paths are covered; prior verified Stripe and speech provider evidence remains recorded in their phase acceptance documents.                                                                                                                                     | Pass   |
| Transaction audit        | Existing D1 reservation transitions and payment events render in timestamp order; Phase 5 verified checkout/refund terminal events and duplicate replay behavior.                                                                                                                                                     | Pass   |
| Correlation              | `phase8-live-ai-20260814` connects the safe Worker log, tool row, provider row, API timeline, and direct D1 query; an unknown ID renders the explicit no-match state.                                                                                                                                                 | Pass   |
| Data safety              | Repository allowlisting plus authorization/filter tests omit prompts, transcripts, audio, cookies, credentials, and payment details; the repository-wide secret scan passes.                                                                                                                                          | Pass   |
| Responsive/accessibility | Headless Chromium visual inspection and Playwright checks pass at desktop and Pixel 7 sizes; native form controls support keyboard operation and statuses do not rely on color.                                                                                                                                       | Pass   |
| Cloudflare observability | Preview version `c2faa74f-ce5c-4897-a09a-b555c9359f3c` emitted a Cloudflare-native trace/log set for `phase8-preview-final-log-20260814`; persisted application logs and traces are enabled while invocation-log persistence is disabled. Owner-provided dashboard evidence confirms the persisted contents are safe. | Pass   |

## Recorded acceptance evidence

### Automated gates

- `npm run check` — passed formatting, ESLint, TypeScript, secret scan, 102 tests, Vite build, and
  Worker dry-run build.
- `npm run migrate:local` — no migrations pending after `0006_operations.sql`.
- `npm run test:e2e` — 10 checks passed across desktop Chromium and Pixel 7 emulation, including
  unauthorized access, populated stored state, correlation filtering, no-match state, and relock.
- Focused operations corpus — 13 contract/API tests cover populated, empty, failure, unauthorized,
  malformed-filter, provider-degraded, safe-metadata, and unknown-correlation behavior. Existing
  commerce tests retain replay coverage.

### Live provider, log, API, and D1 comparison

A real `dev:ai` request using correlation `phase8-live-ai-20260814` completed with remote Workers
AI and live Ticketmaster data. The safe Worker log recorded only the request ID, outcome, model-use
flag, tool count, route, status, and duration. The protected timeline returned:

- `ai_orchestration`, `completed`, provider `workers-ai`, 1,960 ms;
- `workers-ai`, `healthy`, 1,960 ms;
- allowlisted metadata only: `modelUsed: true`, `toolCount: 1`, `resultCount: 12`.

The protected summary and direct local D1 query agreed exactly on all six counts listed in the
matrix. The D1 tool/provider rows also agreed with the API timeline on correlation, status,
provider, duration, and allowlisted metadata.

Prior live provider evidence remains authoritative for the behaviors reused here:

- `docs/STRIPE_ACCEPTANCE.md` records a real test checkout, verified webhook, refund, ordered D1
  transitions, and safe replay.
- `docs/VOICE_LIFECYCLE_ACCEPTANCE.md` records real Whisper and Aura-1 latency, the MeloTTS failure,
  typed fallback, and `persistedRawAudio: false`.

### Deployed Cloudflare preview evidence

- URL: `https://scout-preview.veeravaagu-vishal.workers.dev`
- Worker: `scout-preview`, version `c2faa74f-ce5c-4897-a09a-b555c9359f3c`
- Remote D1: `scout-preview`, ENAM, ID `f2e56e18-3cce-4975-844b-2508f8962fab`
- All six migrations applied remotely.
- `OPS_ACCESS_TOKEN`, Ticketmaster, and Stripe values are Cloudflare secrets; version inspection
  lists names only.
- Unauthenticated operations summary returned HTTP 401. A valid operator session uses an
  HttpOnly, Secure, SameSite=Strict cookie.
- Protected preview summary and direct remote D1 agreed on 0 reservations, 0 checkouts, 0 payment
  events, 0 audit events, 3 tool invocations, and 3 provider-health events immediately after the
  first evidence run.
- `phase8-preview-live-20260814` returned seven live Ticketmaster events and produced matching
  healthy tool/provider rows at 421 ms.
- `phase8-preview-degraded-20260814` used a deliberately invalid preview-only Ticketmaster secret,
  returned a truthfully labeled fixture fallback, and produced matching degraded rows at 141 ms
  with `invalid_credentials`. The real secret was immediately restored, and subsequent live
  requests succeeded.
- Cloudflare's native tail recorded `phase8-preview-final-log-20260814` on the privacy-hardened
  version: outcome `ok`, EWR, seven live results, 137 ms provider duration, HTTP 200, and 179 ms
  request duration. The protected timeline returned the same correlation, provider, status,
  duration, and result count.
- The response carried Cloudflare Ray ID `a2b1b93deef70ab9` for the final tailed request.

The native tail envelope demonstrated that automatic invocation logging includes raw request
headers. Scout therefore disables persisted invocation logs and retains only its allowlisted
application logs plus Cloudflare traces. No operation credential, cookie, prompt, transcript, raw
audio, or payment field appeared in Scout's application log messages, API timeline, or D1 rows.

### Browser review

The operations surface was visually inspected at 1,440 px desktop and 390 px mobile widths. Summary
cards, filter controls, status badges, and timeline details remain readable without horizontal
overflow. The isolated Playwright server uses a dedicated port and D1 state, so it cannot silently
exercise the owner's separate development session.

## Persisted trace acceptance

On 2026-08-14, the owner opened Cloudflare **Observability → Traces** and supplied screenshots of
trace `62a10c89f5c7672f5b4d75f4311817f2` for the final request at 13:36:45 GMT-4. The trace contained
the expected 203 ms root GET span, a 136 ms Ticketmaster fetch, and D1 inserts for
`tool_invocations` and `provider_health_events`. Its Logs view contained exactly the allowlisted
`event_search` and `http_request` messages for `phase8-preview-final-log-20260814`.

The displayed spans and log messages contain route/provider execution metadata, correlation,
status, result count, and duration only. No credential, cookie, prompt, transcript, raw audio, or
payment value appears. This closes the final Cloudflare observability gate.

## Phase decision

**VERIFIED COMPLETE.** Protected D1 operations views, authorization and privacy boundaries,
populated/empty/failure/replay/degraded regressions, live provider behavior, desktop/mobile UI,
remote preview D1 comparison, Cloudflare-native logs, and persisted trace inspection all pass.
Phase 9 may begin.

Optional local OTel Collector + Jaeger remains optional and is not a closure blocker.
