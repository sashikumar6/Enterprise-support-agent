# Post-release UI refresh acceptance

Date: 2026-08-14

Status: **LOCAL IMPLEMENTATION CHECKED; OWNER VISUAL APPROVAL AND PRODUCTION DEPLOYMENT PENDING**

## Goal

Replace Scout's portfolio-demo visual impression with a calmer, production-shaped consumer
product hierarchy while preserving every verified discovery, voice, plan, commerce, lifecycle,
and operations boundary.

## Reference and licensing review

- Navan's public website informed the editorial light palette, restrained purple accent,
  rounded product stage, compact trust signals, and task-first hierarchy. No Navan source,
  branding, imagery, or proprietary product copy was copied.
- Beautiful UI informed the agent activity, chat-composer, tool-chip, recommendation, and
  approval-state treatments. Scout directly adapted its MIT-licensed pixel loading/shimmer
  pattern and records the license in `THIRD_PARTY_NOTICES.md`.
- beUI informed compact pill actions, composed prompt controls, and reduced-motion behavior.
  No beUI source was copied in this slice.
- Lucide supplies the product control icons under its ISC license, with upstream Feather-derived
  icons retaining their MIT license. Notices are recorded in `THIRD_PARTY_NOTICES.md`.
- The NYC evening photograph was generated specifically for Scout with the built-in image tool;
  no third-party campaign image or recognizable person was used.

## Implemented scope

- Added a product announcement rail and rebuilt the header for a light application shell.
- Reworked the hero into a Navan-inspired editorial/product composition with explicit primary
  and structured-search actions.
- Reframed the concierge inside a responsive product stage with visible provider and
  human-control trust signals.
- Restyled the prompt composer, voice controls, suggestions, result cards, structured filters,
  saved plans, lifecycle cards, operations console, and trust summary as one visual system.
- Added a reusable Beautiful UI-derived agent activity indicator for conversational and
  provider-search loading states.
- Replaced text-heavy utility controls with accessible SVG icons and hover/focus tooltips for
  microphone, playback, mute, voice settings, submit, search, save, refresh, and external links.
- Consolidated test-mode and sample-data disclosures into the relevant data, plan, checkout,
  cancellation, and footer contexts instead of repeating portfolio/demo language throughout the
  primary experience.
- Added an optimized original editorial image to the concierge product stage.
- Preserved reduced-motion handling and fixed the 390 px mobile layout after visual review.

## Acceptance evidence

| Check                            | Result         |
| -------------------------------- | -------------- |
| TypeScript project build         | Passed         |
| Unit/API suite                   | 105/105 passed |
| Web and Worker production builds | Passed         |
| Desktop Playwright journeys      | 5/5 passed before final icon/image polish; rerun pending |
| Mobile Playwright journeys       | 5/5 passed before final icon/image polish; rerun pending |
| Owner visual approval            | Pending at `http://localhost:8787`                      |
| Production deployment            | Not started                                              |

## Preserved claims and boundaries

- New York remains the only supported geography.
- Provider facts, prices, availability, and state remain server-authoritative.
- AI remains read-only and cannot reserve, pay, cancel, or bypass confirmation.
- Stripe remains test-mode only and Scout still does not issue a Ticketmaster ticket.
- Production should not be described as carrying this refresh until a separate deployment and
  deployed smoke check pass.
