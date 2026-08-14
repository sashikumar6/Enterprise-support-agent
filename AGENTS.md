# Repository guidance

## Project direction

This repository is the clean starting point for a production-shaped consumer AI events
concierge. The obsolete SupportIQ telecom-support prototype was deliberately removed on
2026-08-13 after the product pivot was approved; it is recoverable from Git history. Read
`docs/PROJECT_HANDOFF.md` completely before planning or changing the application.
That document is the source of truth for product scope, architecture, constraints,
provider choices, implementation sequence, and acceptance criteria.

Do not restore or extend SupportIQ unless the user explicitly reverses the pivot. New
application structure should be created only after the Ticketmaster data-quality spike
passes the go/no-go gate.

## Non-negotiable constraints

- The project must remain usable and publicly demonstrable for $0.
- Never present a sandbox reservation as a real Ticketmaster ticket or purchase.
- External provider data, prices, availability, and payment state are authoritative;
  an LLM is not.
- Require explicit confirmation before checkout, reservation, cancellation, or any other
  consequential external action.
- Voice is an input/output channel for the same governed agent, not a separate authority.
  Require microphone consent, keep an editable text transcript, and do not persist raw audio
  by default.
- Keep provider integrations behind interfaces so Ticketmaster, Workers AI, Gemini,
  Stripe, and future commercial providers can be replaced.
- Begin as a modular monolith. Do not introduce microservices, Kubernetes, or Helm
  without a measured requirement or an explicit user request.
- Do not commit credentials, API keys, OAuth tokens, webhook secrets, or user data.
- Request external accounts only when their implementation phase begins. Guide the user
  through setup step by step, and never ask them to paste a secret into chat.
- Prefer the smallest vertical slice that can be verified end to end.

## Engineering workflow

Before implementation, state assumptions and define a verifiable outcome. Build in
the phase order in `docs/PROJECT_HANDOFF.md`; the Ticketmaster data-quality spike is
the first go/no-go gate. Add tests with behavior, keep changes scoped, and update the
handoff decision log when a material decision changes.
