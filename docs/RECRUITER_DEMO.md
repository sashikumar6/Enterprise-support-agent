# Scout recruiter demo

Target length: 5–7 minutes. Use the public production URL and keep Stripe in test mode.

## Before the call

- Open the public URL in a fresh browser profile.
- Confirm **System online** and `/api/v1/readiness` is healthy.
- Keep one fixture request ready in case a free provider quota is unavailable.
- Never display `.dev.vars`, Cloudflare secrets, the operations token, or Stripe dashboard secrets.

## Script

1. **Problem and boundary — 30 seconds**
   “Scout turns a vague New York event request into explainable provider-backed options. It uses
   real discovery data, but checkout and reservations are explicitly sandbox demonstrations.”

2. **Governed AI discovery — 90 seconds**
   Ask: “What kind of shows are available in New York at 5 PM this Friday?” Show the resolved date,
   exact ±30-minute window, grounded explanation, live source/freshness, missing-price treatment,
   and separately labeled alternatives. Explain that deterministic code—not the model—decides
   which provider events match.

3. **Provider-independent fallback — 45 seconds**
   Switch to **Demo fixtures only** and search comedy. Point out the visible fixture label and that
   exact filters work without AI or provider quota.

4. **Governed action — 90 seconds**
   Save a plan. Show the immutable event snapshot and the “not a reservation, ticket, or purchase”
   disclosure. Open the checkout review and stop before continuing unless a full Stripe test run is
   appropriate. Explain that only the signed webhook confirms the demo reservation.

5. **Lifecycle and voice — 60 seconds**
   Show editable preferences, status refresh, in-app alerts, and the honest unstaffed help record.
   Demonstrate push-to-talk only with microphone consent; edit the transcript before submission and
   mention that raw audio is not retained.

6. **Operations and engineering — 90 seconds**
   Unlock operations privately, filter by a correlation ID, and connect tool/provider latency to
   audit and reservation state. Summarize the modular monolith, provider ports, D1 migrations,
   rate-limit bindings, preview/production isolation, tests, and rollback runbook.

## Truthful resume bullets

- Built and deployed a provider-agnostic TypeScript/React events concierge on Cloudflare Workers
  with live Ticketmaster discovery, deterministic constraint resolution/ranking, and governed
  Workers AI tool use.
- Designed an idempotent Stripe test-mode checkout, signed-webhook, demo-reservation, cancellation,
  and refund state machine with durable D1 audit history and explicit user confirmation.
- Implemented turn-based Whisper/TTS voice, editable transcripts, provider fallbacks, server-owned
  abuse controls, protected operations timelines, CI/browser tests, isolated release environments,
  and tested rollback procedures on a $0 feasibility stack.

Do not claim real ticket issuance, real payments, nationwide support, staffed assistance,
commercial uptime, Kubernetes, Gemini, Claude, or another unimplemented provider.
