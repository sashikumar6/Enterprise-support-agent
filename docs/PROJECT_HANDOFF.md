# Scout project handoff

Status: Phase 4 complete; Phase 5 Stripe sandbox is next
Last updated: 2026-08-13  
Working name: **Scout** (provisional; perform a naming/trademark check before public launch)

## 1. Purpose of this document

This is the durable source of truth for building a resume-grade, production-shaped
consumer AI events concierge in the repository that formerly contained SupportIQ. It
captures the product definition, market research, open-source research, data and
provider constraints, architecture decisions, delivery sequence, risks, testing
strategy, account requirements, and unresolved decisions.

A new developer or coding agent should be able to read this document and understand:

1. What is being built and why.
2. What the product may and may not claim.
3. Why the architecture deliberately avoids premature microservices.
4. Which services can be used without paying.
5. What must be validated before feature development.
6. What constitutes a convincing completed portfolio product.

This is a living document. Material changes belong in the decision log near the end.

## 2. Executive decision

Build a consumer-facing AI local-events concierge that turns a vague request into a
realistic, governed transaction:

> A user describes the experience they want. The assistant identifies constraints,
> searches live event inventory, ranks and explains suitable options, obtains explicit
> confirmation, completes a Stripe test-mode checkout, creates a clearly labeled demo
> reservation, and lets the user manage that reservation.

The project is not a generic chatbot, a support bot, or an imitation ticket seller.
It is a **personalized, governed, action-taking vertical AI application**.

The public deployment is best described as:

> A production-shaped feasibility deployment using live event data, sandbox commerce,
> durable application state, real OAuth integrations, observability, automated tests,
> and replaceable provider adapters.

The current recommendation is events rather than flights or hotels because real event
discovery data is available at no charge and a complete decision-to-checkout journey can
be demonstrated without pretending to issue real tickets. Real travel fulfillment would
require commercial GDS/NDC, airline, lodging, fraud, tax, servicing, and reconciliation
relationships that cannot honestly be reproduced for $0.

## 3. User and career goals

The owner is targeting a mixture of:

- Full-stack engineering
- AI/agent engineering
- Backend engineering
- Platform engineering
- General software engineering roles that may mention containers, Kubernetes, cloud,
  Google APIs, REST APIs, and model providers such as Claude

The project therefore needs to show breadth without becoming a technology showroom.
Each integration must support a real user journey or a demonstrable operational need.

Resume story:

> Designed and deployed a provider-agnostic AI events concierge that orchestrates live
> Ticketmaster discovery, deterministic ranking, structured model tool calls, Stripe
> sandbox payments, durable reservation workflows, optional OAuth integrations, audit trails,
> distributed-tracing concepts, and tested failure fallbacks on a zero-cost cloud stack.

## 4. Repository state

The repository formerly contained **SupportIQ**, a Python/FastAPI and React telecom-support
prototype with hard-coded intent routing and simulated enterprise systems. On 2026-08-13,
the owner explicitly approved deleting it because the pivot to Scout is final and retaining
two unrelated products would confuse development, dependencies, documentation, and reviewers.

The SupportIQ application source, policy fixtures, dependencies, generated database, and
bytecode were removed from the working tree. Previously committed source remains recoverable
from Git history; generated local artifacts are not preserved. The repository now contains
the Scout handoff, repository guidance, and a minimal Scout README. No Scout application code
exists yet.

Do not restore, archive, or incrementally transform SupportIQ. Create Scout cleanly after the
Ticketmaster data-quality spike passes its go/no-go gate.

## 5. Product definition

### 5.1 Primary user

A consumer who wants an activity but does not want to search across many event pages and
filters. Example:

> “Find a funny date-night event in Boston next Friday, under $120 total, not too late.”

### 5.2 Core job to be done

Help the user move from ambiguous intent to a confident, executable plan.

### 5.3 Golden path

1. User enters a natural-language request. The request may be typed or captured through the
   approved push-to-talk voice channel.
2. Assistant extracts location, date window, party size, interests, budget, and constraints.
3. Assistant asks only for information required to perform a useful search.
4. Application queries live Ticketmaster Discovery data.
5. Deterministic code normalizes, filters, scores, and sorts candidates.
6. Assistant explains why the strongest candidates fit.
7. User selects an event.
8. Product displays the provider source, freshness, known price limitations, and a sandbox notice.
9. User explicitly confirms a simulated purchase.
10. Stripe test mode completes or fails realistically.
11. A signed webhook/idempotent handler advances the reservation state.
12. Product shows a demo receipt and saved plan, not a real Ticketmaster ticket.
13. User can cancel/refund the demo reservation according to the simulated policy.
14. Operations view exposes tool calls, latency, failures, state changes, and audit history.

### 5.4 Product surfaces

- Conversational discovery
- Push-to-talk voice input, editable transcription, and optional spoken response
- Structured event result cards
- Event comparison/detail view
- Sandbox checkout
- My Plans / reservation management
- Operations and audit console
- System/provider status display
- Persistent preferences, event-status monitoring, and proactive in-app alerts
- Live-provider, deterministic-fallback, and fixture-demo modes with visible labeling

### 5.5 Navan-inspired capability parity

“Same features as Navan” means matching the important product pattern inside Scout’s event
vertical, not reproducing Navan’s travel supplier network, finance platform, or human workforce.
Navan publicly describes conversational booking, real-time inventory, persistent preferences,
explicit confirmation, itinerary management, proactive disruption assistance, loyalty context,
and human support. Navan also describes three distinct voice uses: natural-language voice
commands in AI travel, video/voice expense capture, and a beta outbound Voice Agent that calls
hotels. Only the first maps directly to Scout.

References:

- Navan Edge capabilities: <https://navan.com/blog/edge/what-is-ai-travel-agent>
- Explicit confirmation and human fallback: <https://navan.com/blog/edge/how-to-use-ai-for-business-travel>
- Navan outbound Voice Agent: <https://navan.com/blog/ai-agents-for-travel>
- Navan expense with video and voice: <https://investors.navan.com/news-releases/news-release-details/navan-unveils-new-ai-powered-features-save-finance-teams-and>

| Navan capability class    | Scout event-domain equivalent                                          | Version-1 treatment                          |
| ------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| Conversational request    | Natural-language event request                                         | Required                                     |
| Voice commands            | Push-to-talk event request with editable transcript                    | Required                                     |
| Spoken assistant          | Optional generated audio for the text response                         | Required, user-controlled                    |
| Live inventory            | Ticketmaster Discovery results                                         | Required, with public-API caveats            |
| Rich comparison           | Event cards, details, source, constraints, and score reasons           | Required                                     |
| Preference memory         | Genres, budget, distance, time, accessibility, favorite venues/artists | Required                                     |
| Personalized ranking      | Deterministic scoring plus grounded AI explanation                     | Required                                     |
| Confirmation gate         | Explicit approval before sandbox checkout/change/cancel                | Required                                     |
| Booking                   | Stripe test payment and clearly labeled demo reservation               | Required simulation                          |
| Trip/itinerary management | My Plans with selected and reserved events                             | Required                                     |
| Disruption handling       | Recheck event status and surface cancellations/reschedules             | Required where provider data permits         |
| Proactive assistance      | In-app alert on saved-plan status changes                              | Required; no SMS/email in v1                 |
| Human fallback            | Escalation/request-help record visible in operations console           | Simulated workflow; no staffed support claim |
| Loyalty wallet            | Remember favorite artists/venues and preference signals                | Domain adaptation, not points/rewards        |
| Mobile access             | Responsive installable PWA                                             | Required; no native app                      |
| Operational control       | Tool timeline, provider health, state/audit view                       | Required                                     |

Voice version 1 is **turn-based**, not a real-time full-duplex phone conversation:

1. Browser requests microphone permission only after the user presses the microphone control.
2. User records a clip of at most 30 seconds and can cancel before upload.
3. Cloudflare-hosted Whisper transcribes it.
4. The transcript is displayed and remains editable before submission.
5. The existing text-agent path processes the request; voice never bypasses validation,
   confirmation, authorization, or audit controls.
6. The text answer is always rendered. If enabled, Cloudflare-hosted TTS produces a spoken
   version capped at 600 characters that the user can stop, replay, mute, or disable.
7. Raw audio is not persisted by Scout after transcription by default.

This creates one channel-neutral conversation history rather than separate text and voice
agents. Cloudflare currently hosts Whisper ASR and MeloTTS/Aura TTS models inside Workers AI;
their usage consumes the same daily free allocation as text inference.

References:

- Whisper: <https://developers.cloudflare.com/workers-ai/models/whisper/>
- Whisper large v3 turbo: <https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/>
- MeloTTS: <https://developers.cloudflare.com/workers-ai/models/melotts/>
- Workers AI pricing: <https://developers.cloudflare.com/workers-ai/platform/pricing/>

### 5.6 Explicit non-goals for version 1

- Issuing Ticketmaster tickets
- Charging real money
- Claiming exact live seats, fees, or final price
- Scraping protected travel or event websites
- Building an event-organizer marketplace
- Training a recommender model from a nonexistent user-history corpus
- Multi-region active-active architecture
- Microservices
- A public Kubernetes deployment
- Native mobile applications
- Email or SMS delivery
- Full-duplex telephone/voice calling
- Autonomous outbound calls to venues
- Video/voice expense capture
- Real human support staffing
- Travel booking, corporate expense management, and loyalty-point accounting
- Autonomous purchasing without confirmation

## 6. Is this unique?

No broad idea here is completely unique. Consumer AI travel assistants, personalized
event recommenders, open-source ticketing platforms, and open-source travel search tools
already exist. That is positive validation: the problem and interaction pattern are real.

The differentiation is the **specific end-to-end portfolio implementation**:

- Live consumer inventory rather than only seeded cards
- Natural-language constraint gathering
- Deterministic provider-aware ranking rather than LLM hallucination
- Explicit approval gates for consequential actions
- A realistic test-payment and webhook state machine
- Durable reservations and cancellation/refund behavior
- Provider abstraction and graceful quota/outage fallback
- Operations/audit UI and telemetry
- Honest distinction between live discovery and simulated fulfillment
- Public zero-cost deployment plus reproducible local/container workflow

Do not market it as “the first” or “completely unique.” Market it as a thoughtful,
production-shaped implementation of a commercially validated pattern.

## 7. Public consumer landscape

### 7.1 Navan

Navan validates the original interaction model in a business-travel context: conversation,
live inventory, company policy, booking, payment, and servicing. Scout borrows the governed
decision-to-action pattern, not Navan’s corporate travel scope or claims.

Reference: <https://navan.com/>

### 7.2 Mindtrip

Mindtrip is a consumer travel product with tailored recommendations, customizable trip
plans, photos/maps/reviews, collaborative planning, real-time airfare, and partner-backed
hotel, restaurant, and experience discovery.

Reference: <https://mindtrip.ai/home>

Lesson: a successful consumer assistant combines conversation with structured visual
artifacts and editable plans. Chat alone is insufficient.

### 7.3 Layla

Layla markets personalized itineraries across flights, hotels, activities, dining, road
trips, and multi-city journeys, backed by partners such as Booking.com, Skyscanner,
Viator, and GetYourGuide. It offers free planning with optional paid features.

Reference: <https://layla.ai/>

Lesson: provider partnerships are the real moat in travel. A free portfolio project should
not pretend it can reproduce them.

### 7.4 EventGenie

EventGenie is the closest public analogue to Scout’s discovery concept. It describes an AI
entertainment concierge, personalized recommendations and feeds, preference learning,
wish lists, and event status alerts. Its positioning is London/culture-oriented.

Reference: <https://www.eventgenie.ai/>

Lesson: personalized event discovery is validated but not unique. Scout must distinguish
itself through an inspectable transaction workflow, operational controls, provider seams,
and engineering transparency.

### 7.5 Other adjacent products

Eventbrite, Dice, Posh, Xceed, Google Maps/Search, venue apps, and ticket marketplaces all
offer forms of event discovery, personalization, or booking. They are competitors for the
user’s attention even when they do not expose the exact chat-first workflow.

Conclusion: this is an established category with room for a strong technical portfolio
demonstration. It is not an uncontested startup concept.

## 8. Open-source landscape

No mature repository found in this discovery pass exactly combines a polished consumer
events concierge, live multi-constraint discovery, governed AI tools, test checkout,
durable reservations, observability, and public deployment.
Search results can never prove that none exists, so this is a scoped finding rather than an
absolute claim.

### 8.1 Open Travel AI Platform (OTAIP)

- TypeScript domain/orchestration platform for travel
- Apache-2.0 license
- Extensive package/test structure
- Orchestration foundation rather than Scout’s finished consumer product

Reference: <https://github.com/TelivityAI/otaip>

Use: architecture inspiration only. Do not adopt its complexity wholesale.

### 8.2 trvl

- Go binary and MCP server for flight, hotel, ground transport, weather, and destination search
- Live provider aggregation and typed provider-failure behavior
- Runs as a local tool rather than a hosted consumer app
- PolyForm Noncommercial license; commercial hosted use requires a paid license
- Some sources may reuse browser sessions or interact with provider protections

Reference: <https://github.com/MikkoParkkola/trvl>

Decision: do not copy or make it a core dependency. Licensing and provider-operational risk
conflict with the clean, zero-cost, public portfolio goal.

### 8.3 LetsFG

- Agent-oriented flight/hotel SDK, CLI, MCP, and hosted search
- Free search path currently requires a payment method on file and a renewable token
- Hosted dependency, long search times on some paths, and paid developer tiers

Reference: <https://github.com/LetsFG/LetsFG>

Decision: interesting future experiment, not a dependable zero-cost foundation.

### 8.4 Hi.Events

- Mature open-source organizer-side ticketing platform
- React, Laravel, PostgreSQL, Redis, Docker
- Ticket sales, checkout, attendee management, refunds, QR check-in, analytics, and REST API
- AGPL-3.0 plus attribution requirements

Reference: <https://github.com/HiEventsDev/hi.events>

Use: study its concepts for orders, tickets, refunds, webhooks, operations, and tests.
Do not fork it for Scout; it solves organizer ticketing, not conversational public discovery,
and its scope would overwhelm a focused portfolio build.

### 8.5 EventSeats and Festapp

These demonstrate open-source seat booking and full event/ticket management respectively,
but they are venue/organizer products rather than live cross-provider consumer concierges.

- <https://github.com/Hannah-goodridge/eventseats>
- <https://github.com/vkh-cr/festapp>

### 8.6 Gorse

Gorse is a capable distributed open-source recommendation engine with REST APIs and
multiple storage backends.

Reference: <https://github.com/gorse-io/gorse>

Decision: not version 1. Scout has no interaction history requiring collaborative filtering.
Start with explainable deterministic scoring. Adding a distributed recommender before data
exists would be resume theater rather than sound engineering.

### 8.7 Smaller Ticketmaster/event-discovery repositories

GitHub contains Ticketmaster MCP servers, React discovery apps, AI theater discovery demos,
and underground-event applications. These validate developer interest but do not change the
core recommendation. Review specific repositories for ideas only after checking their license,
activity, dependency health, tests, data sources, and whether the advertised features actually
exist in code.

Topic reference: <https://github.com/topics/ticketmaster>

## 9. Live event data: Ticketmaster Discovery API

Official documentation:

- Discovery API: <https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/>
- FAQ and public quotas: <https://developer.ticketmaster.com/support/faq/>
- Restricted availability API: <https://developer.ticketmaster.com/products-and-docs/apis/partner/availability/>

### 9.1 What is real

The public API searches actual event, venue, and attraction records from Ticketmaster and
affiliated sources. It provides enough data to support credible discovery:

- Event identity and name
- Event and provider URL
- Date/time/time-zone fields
- Venue, city, state, country, and often coordinates
- Attractions/performers
- Classifications, segments, genres, and subgenres
- Images
- On-sale information
- Event status information
- Ticket limits where present
- Optional minimum/maximum price ranges

Ticketmaster reports more than 230,000 events across supported markets. These are real
events and real provider pages, not generated fixtures.

### 9.2 What is not available publicly

- Guaranteed seat-level inventory
- Inventory holds
- Exact remaining ticket counts
- Final taxes and fees
- Complete price data for every event
- Ticket issuance
- Ticketmaster order creation
- Ticketmaster refunds/cancellations

Those capabilities depend on restricted partner/commercial APIs and agreements.

### 9.3 Known data limitations

- `priceRanges` is optional and may not represent the final checkout total.
- Event descriptions may be sparse.
- Images may include generic/fallback artwork.
- Geographic and category coverage is uneven.
- Small community, Meetup-style, free, and independent events may be absent.
- Cancelled/rescheduled/postponed states require explicit UI treatment.
- Duplicate-looking events or multiple performances can occur.
- Deep paging is limited; `size * page` must remain below 1,000.
- Discovery availability does not mean a purchasable seat remains.

Product copy must say “events indexed by Ticketmaster sources,” not “all events near you.”

### 9.4 Quotas

Official pages currently state a 5,000-request daily allocation and contain differing
per-second figures. Engineer to the stricter two requests/second interpretation.

Implementation controls:

- Server-side API key only
- Input normalization and validation
- Debounced client requests
- Application-level per-user/session rate limit
- Request coalescing for identical searches
- Short-lived cache only when permitted by provider terms
- Bounded result/page sizes
- Backoff for 429 and transient failures
- Circuit breaker/fallback behavior
- Recorded provider latency/status without logging secrets

### 9.5 Mandatory data-quality spike

This is the first go/no-go gate after obtaining a free key. Do not build the polished
application before completing it.

Query at least Boston, New York City, and Philadelphia for the next 30 days. Produce a
repeatable report measuring:

- Total result count per city and category
- Event variety for music, sports, arts/theater, comedy/family where available
- Venue/date/provider-URL completeness
- Coordinate completeness
- `priceRanges` presence
- Useful versus fallback/missing image rate
- Cancellation/reschedule status presence
- Apparent duplicate rate
- Count of events usable in an end-to-end demo
- Latency and error behavior

Initial acceptance gates:

- At least 100 upcoming results in the chosen launch city
- At least five useful event categories or subcategories
- At least 80% with venue, date, and provider URL
- At least 30 events suitable for the complete demonstration
- A truthful missing-price experience that remains useful

The spike should store sanitized response fixtures for tests, subject to Ticketmaster’s
terms. Never commit the API key.

## 10. Commerce model

Use Stripe **test mode only**. Test mode is realistic enough to demonstrate checkout UI,
PaymentIntent/session behavior, signed webhooks, idempotency, failures, cancellation, and
refund state without moving money.

Rules:

- Every checkout surface states that no real ticket or charge will be created.
- Never collect or store raw card numbers; use Stripe-hosted elements/checkout.
- A client redirect is not proof of payment. Only the verified server-side webhook advances
  payment/reservation state.
- Store Stripe test identifiers, not sensitive payment data.
- Webhook processing is idempotent.
- Reservation creation and refund transitions are auditable.
- The internal demo reservation must not use language implying Ticketmaster fulfillment.
- If the event has no price range, do not invent a provider price. Either exclude it from
  checkout or display an explicitly fictional demo price unrelated to provider pricing.

Suggested state machines:

```text
checkout:     created -> pending -> succeeded | failed | expired
reservation: draft -> payment_pending -> confirmed -> cancellation_pending -> cancelled
refund:       not_requested -> pending -> succeeded | failed
```

All transitions need invariants and tests. Invalid or repeated events become safe no-ops or
explicit conflicts.

## 11. AI provider strategy

### 11.1 Primary: Cloudflare Workers AI

Workers AI offers a daily free allocation and models with structured JSON/function-calling
capabilities. It is adequate for one-person development and recruiter demonstrations when
prompts and loops are bounded.

References:

- Pricing: <https://developers.cloudflare.com/workers-ai/platform/pricing/>
- Limits: <https://developers.cloudflare.com/workers-ai/platform/limits/>
- Function calling: <https://developers.cloudflare.com/workers-ai/features/function-calling/>
- JSON mode: <https://developers.cloudflare.com/workers-ai/features/json-mode/>
- Errors: <https://developers.cloudflare.com/workers-ai/platform/errors/>

Current free allowance: 10,000 neurons/day, resetting daily. Exhaustion returns an error
rather than silently charging. Exact prompt capacity depends on model and token mix; do not
promise a fixed number of chats.

Text generation, speech recognition, and text-to-speech share this allowance. Voice therefore
needs short clip limits, response-length limits, visible quota/fallback handling, and usage
instrumentation. If speech quota is exhausted, typed interaction remains fully functional.

The model may:

- Extract structured preferences
- Identify missing required constraints
- Choose from an allowlisted set of read tools
- Explain deterministic recommendations
- Summarize conversation history

The model may not authoritatively determine:

- Event existence, price, or availability
- Payment success
- Authorization
- Reservation state
- Refund eligibility

All tool inputs are schema-validated. The server owns authorization, confirmation, and state.

### 11.2 Google Gemini: useful optional second adapter

Google Gemini’s Developer API currently has a free tier for selected models and bounded
rate limits. Free-tier content may be used to improve Google products, so never send secrets,
payment data, OAuth tokens, or personally sensitive information.

References:

- Pricing: <https://ai.google.dev/gemini-api/docs/pricing>
- Billing/tier behavior: <https://ai.google.dev/gemini-api/docs/billing>

Recommended role:

- Implement `GeminiAIProvider` after the Workers AI vertical slice works.
- Run the same provider contract/evaluation suite against both.
- Expose model/provider only in the operations view, not as consumer complexity.
- Demonstrate REST API integration, structured generation, provider portability, and evals.

Gemini should not become a second agent architecture. It is another implementation of the
same `AIProvider` contract.

### 11.3 Claude

Claude’s consumer chat has a free plan, but that does not equal free programmatic API access.
Anthropic’s API is a separate pay-as-you-go product; new accounts may receive small trial
credits, but that is not a durable zero-cost foundation.

References:

- API: <https://www.anthropic.com/claude/api>
- Pricing: <https://www.anthropic.com/pricing>
- Consumer versus API billing: <https://support.anthropic.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console>

Decision: define the provider contract so a future `AnthropicAIProvider` is straightforward,
but do not require Claude, an Anthropic account, or Anthropic credits for version 1. A fake or
unused Claude integration would weaken the project.

### 11.4 Deterministic fallback

The product must still function when every LLM quota is exhausted:

- Structured search form
- Deterministic parsing of form values
- Ticketmaster results and filters
- Explainable scoring components
- Checkout, reservations, and operations workflows
- Clearly labeled fixture mode if the event provider is unavailable

Optional Ollama can support local development but cannot be the fallback for a public Worker
unless a separately hosted machine is always available.

## 12. GCP, gRPC, Google APIs, and protocol clarification

There are three different Google-related concepts in this discussion:

- **Google Cloud Platform (GCP), now branded Google Cloud**, is a cloud-computing platform
  comparable to AWS and Azure. It offers compute, storage, databases, networking, managed
  Kubernetes, serverless runtimes, IAM, observability, and many other hosted services.
- **gRPC** is an open-source remote-procedure-call framework initially created by Google. It
  commonly uses Protocol Buffers to define strongly typed service contracts and HTTP/2 as its
  transport. It is an API communication approach, not a cloud provider.
- **Google APIs** are the individual service APIs Google publishes, such as Maps, Gmail,
  YouTube, and Google Cloud service APIs. Depending on the service, clients may use REST/JSON,
  gRPC, generated client libraries, or HTTP transcoding.

Official references:

- Google Cloud overview: <https://docs.cloud.google.com/docs/overview>
- gRPC history: <https://grpc.io/about/>
- Google Cloud API design guide: <https://docs.cloud.google.com/apis/design>

REST, SOAP, and gRPC are also not three interchangeable formats:

- REST is an API architectural style commonly using HTTP and JSON.
- SOAP is an XML messaging protocol used in some enterprise/legacy systems.
- gRPC models operations as strongly typed remote procedure calls, generally defined with
  Protocol Buffers; it is especially common for service-to-service communication.

They can coexist. Google’s API design guidance applies to REST and RPC APIs, focuses on gRPC,
and documents JSON/HTTP-to-Protocol-Buffers/RPC transcoding.

Do not add SOAP artificially. If demonstrating SOAP later is a career requirement, create a
small separately documented legacy-provider adapter and contract test; do not distort Scout’s
core architecture.

### 12.1 Google Maps/Places: not required

Google Maps Platform is pay-as-you-go and Places web services require billing even though
individual SKUs have monthly free usage caps.

References:

- Pricing overview: <https://developers.google.com/maps/billing-and-pricing/overview>
- Places billing requirements: <https://developers.google.com/maps/documentation/places/web-service/usage-and-billing>

Decision: avoid it for the zero-payment-method product foundation. Use provider coordinates,
an OpenStreetMap-based display only if its tile-use policy is respected, or simply link to
maps in version 1. A map is not needed for the golden path.

## 13. Cloud and hosting decision

Cloud is required only because the product needs a public URL, server-side secrets, webhooks,
and durable shared state. “Cloud” does not imply virtual machines or Kubernetes.

Recommended public platform: **Cloudflare**.

Cloudflare provides the cloud runtime, CDN/edge delivery, database binding, AI inference,
secrets, deployments, logs, and traces. AWS is not required and should not be used merely
because the owner already has an AWS account.

### 13.1 Proposed stack

- TypeScript end to end
- React + Vite frontend
- Tailwind CSS with selected MIT-licensed Beautiful UI primitives adapted to Scout
- Hono API/application on Cloudflare Workers
- One same-origin Cloudflare project serving static assets and API where practical
- Cloudflare D1 with Drizzle and versioned SQL migrations
- Cloudflare Workers AI as primary model provider
- Ticketmaster Discovery adapter
- Stripe test-mode adapter and signed webhooks
- Open-Meteo adapter for relevant weather context
- Vitest for unit/integration/contract tests
- Playwright for end-to-end journeys
- Provider fixtures/MSW for deterministic tests
- Wrangler for development, migrations, bindings, secrets, and deployment
- GitHub Actions for CI/CD

### 13.2 Current free limits to design against

Verified against official pricing documentation on 2026-08-13. Verify limits again when
implementation reaches deployment. The account must remain on **Workers Free**; do not enable
Workers Paid, which has a $5/month minimum and metered overages.

Cloudflare Workers:

- 100,000 requests/day
- 10 ms CPU time per request on free plan
- 128 MB memory
- 50 external subrequests/request
- 3 MB Worker bundle

Reference: <https://developers.cloudflare.com/workers/platform/limits/>

Cloudflare static assets:

- Static asset requests are free and unlimited.
- Static asset storage has no additional cost within the documented asset limits.
- API/dynamic requests that invoke the Worker count toward the Worker quota.

Reference: <https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>

Cloudflare D1:

- 5 million rows read/day
- 100,000 rows written/day
- 5 GB total storage on free plan
- Queries fail after free quota exhaustion until reset rather than incurring automatic cost

Reference: <https://developers.cloudflare.com/d1/platform/pricing/>

Cloudflare Workers AI:

- 10,000 neurons/day at no charge on Workers Free
- Further inference fails after quota exhaustion; using more requires explicitly upgrading
  to Workers Paid
- Free allocation resets daily at 00:00 UTC

Reference: <https://developers.cloudflare.com/workers-ai/platform/pricing/>

Cloudflare Pages/build limits if a separate Pages deployment is chosen:

- 500 builds/month
- 20,000 files/site
- 25 MiB/file

Reference: <https://developers.cloudflare.com/pages/platform/limits/>

These quotas are ample for a recruiter demo. The important limitations are no commercial
SLA, short observability retention, AI daily quota, Worker CPU/bundle constraints, platform
coupling, and provider terms changing over time.

Zero-cost guardrails:

- Do not add a Workers Paid subscription.
- Do not enable a Cloudflare product that lacks a confirmed free allocation.
- Recheck the dashboard plan and official pricing before every new Cloudflare binding.
- Treat quota exhaustion as a degraded/fallback state, never as permission to upgrade.
- Use the free `workers.dev` hostname; a custom domain would require purchasing a domain.

Alternatives considered:

- **Vercel Hobby** is genuinely free for personal, non-commercial projects and pauses when
  included usage is exhausted. It is strong for frontend/function hosting, but Scout would
  still need separate database and AI providers, increasing account and integration surface.
  Reference: <https://vercel.com/docs/plans/hobby>
- **Render Free** supports conventional web services, but services sleep after 15 minutes of
  inactivity and free PostgreSQL databases expire after 30 days. Its documentation also notes
  that exhausting included outbound bandwidth can trigger supplementary billing. This is a
  poor match for a durable, strict-$0 demonstration.
  Reference: <https://render.com/docs/free>

Decision: retain Cloudflare because one free platform covers the frontend, API, persistent
database, model inference, secrets, deployment, and basic observability with fail-closed
quotas. Revisit only if the data spike proves the 10 ms Worker CPU limit incompatible with
the required application behavior.

### 13.3 D1 suitability

D1 is a good fit for this scale. It supports relational data and SQLite semantics with
minimal operations. It is not PostgreSQL and should not be described as a zero-effort swap.

Limit platform coupling:

- Domain services do not import D1-specific APIs.
- Repository interfaces live inside application boundaries.
- SQL migrations are versioned and reviewed.
- Business invariants are enforced in domain/application code and database constraints.
- Provider/database contract tests preserve behavior.
- Document a future PostgreSQL migration rather than prematurely supporting two databases.

### 13.4 UI component and design source

[Beautiful UI](https://www.beautifului.dev/) is an AI-interface component gallery whose
[official license](https://www.beautifului.dev/license) releases its components under the MIT
License and explicitly permits free use, modification, and distribution. Its React/TypeScript
and Tailwind-oriented primitives fit Scout's conversational and governed-action surfaces.

Decision:

- Use selected primitives such as Chat, Search, Recommendation Card, Approval Card, Loading,
  Thinking, Tool Chips, and records/status patterns where they support an approved Scout flow.
- Adapt the components to Scout's event-discovery identity, provider-source labels, sandbox
  notices, responsive behavior, and accessibility requirements.
- Copy component source into the repository rather than introduce a hosted runtime dependency
  or paid account.
- Preserve the Beautiful UI copyright and MIT license notice in a third-party notices file as
  soon as any component code is copied.
- Do not copy Beautiful UI's name, logo, marketing content, or entire showcase layout. It is a
  component/design source, not Scout's product identity or information architecture.

This choice is compatible with the $0 constraint. Free licensing does not remove the need for
code review, dependency review, accessibility tests, or adaptation to Scout's domain.

## 14. Architecture decision: modular monolith

One deployable application with explicit internal bounded modules:

```text
identity
conversation
discovery
recommendations
checkout
reservations
audit-operations
providers
```

Suggested dependency direction:

```text
UI/API -> application use cases -> domain
                          |          ^
                          v          |
                    provider ports <- provider adapters
                          |
                    persistence ports <- D1 repositories
```

No domain module imports an external SDK directly.

Core provider ports:

```text
EventProvider
AIProvider
PaymentProvider
SpeechProvider
WeatherProvider
Telemetry
Clock
IdGenerator
```

### 14.1 Why not microservices now

Microservices are appropriate when independent teams, scaling profiles, release cadences,
security boundaries, or availability objectives justify them. This project has one developer,
one primary workload, one small database, and no measured independent-scaling requirement.

Splitting now would add network failure, service discovery, distributed transactions,
eventual consistency, multiple deployments, cross-service versioning, and harder local tests.

Reference: <https://learn.microsoft.com/en-us/azure/architecture/microservices/>

### 14.2 Extraction path

Preserve seams so a measured future need can extract:

- Discovery aggregation/cache worker when provider fan-out or traffic demands it
- Checkout/reservation service when compliance or isolation requires it
- Notification worker when durable asynchronous delivery is added
- Analytics pipeline when event volume exceeds operational queries

Extraction should follow evidence, not precede it. Introduce an outbox/event mechanism only
when a real asynchronous consumer exists.

## 15. Docker, Kubernetes, Helm, and infrastructure

### 15.1 Docker: yes

Use Docker for:

- Reproducible tests and builds
- A portable container profile for reviewers
- Optional local Ollama
- Optional local OpenTelemetry Collector and Jaeger
- Demonstrating container health/non-root/configuration practices

The public Cloudflare Worker does not run the application Docker image. Document this clearly.

### 15.2 Kubernetes: no in version 1

Kubernetes manages container scheduling, rollout, recovery, networking, configuration, and
scaling. Scout’s Cloudflare runtime already handles the relevant deployment concerns and does
not execute as a Kubernetes workload.

Reference: <https://kubernetes.io/docs/concepts/overview/>

Adding Kubernetes to the primary product would increase cost and operational surface without
improving the user journey. It would also make the public deployment less honest if only an
untested chart existed.

Optional platform-engineering extension after the public product is complete:

- Containerized portable API profile
- Local `kind` or `k3d` cluster
- Tested manifests or Helm chart
- Health/readiness probes
- Resource requests/limits
- ConfigMap/Secret boundaries
- GitHub Actions smoke installation

This extension is valuable only if it runs in CI/local testing and is explained as a portable
deployment profile, not the production environment.

### 15.3 Helm: only with the optional Kubernetes profile

Helm is a Kubernetes package manager. It has no role in the primary Cloudflare deployment.

Reference: <https://helm.sh/docs/intro/introduction/>

### 15.4 Infrastructure as code

The primary platform still has meaningful infrastructure as code:

- Wrangler configuration
- D1 database/migrations
- Environment/binding declarations
- Secret-name documentation
- CI/CD workflows
- Preview and production environments
- Deployment smoke tests
- Rollback/runbook documentation

## 16. Observability

Instrument from the first vertical slice, but keep it proportional.

Required telemetry:

- W3C trace/correlation ID on each request
- Structured JSON logs
- Request route, status, duration, and safe actor/session ID
- Spans around AI, Ticketmaster, Stripe, Google, and D1 operations
- AI provider/model, latency, token/usage metadata where available, tool-loop count
- Speech model, transcription/TTS latency, clip duration, and failure category without raw audio
- Tool name, validated outcome, and failure category
- Reservation state transition and idempotency result
- Provider quota/rate-limit/circuit status
- Business events: search performed, result selected, checkout started/completed, reservation changed
- Never log secrets, OAuth tokens, card data, or full sensitive prompts

Cloudflare free observability currently provides 200,000 log/trace events per day with
three-day retention. OTLP export requires a paid Workers plan.

References:

- Traces: <https://developers.cloudflare.com/workers/observability/traces/>
- Logs: <https://developers.cloudflare.com/workers/observability/logs/workers-logs/>
- OTel export: <https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/>

Approach:

- Public deployment: Cloudflare native logs/traces
- Local optional profile: OpenTelemetry Collector + Jaeger through Docker Compose
- Application: small telemetry abstraction compatible with OTel concepts
- Long-term business/audit history: stored deliberately in D1, not dependent on three-day logs

## 17. Security and trust boundaries

Threats and controls:

### Prompt/tool abuse

- Allowlisted tools only
- Strict schemas with length/range/enumeration validation
- Tool authorization in server code
- Maximum turns/tool calls/time budget
- Treat provider text as untrusted data
- Never place secrets in model context

### Authentication and authorization

- Guest discovery is acceptable
- Authentication required for persistent plans and operations access
- Ownership checks on every reservation and conversation operation
- Separate operations role/route
- CSRF/state protection for OAuth and state-changing browser requests

### Payments

- Stripe-hosted collection
- Signed webhook verification
- Idempotency keys
- Server-authoritative payment status
- Replay and out-of-order event handling
- Test-mode banner on every relevant surface

### Provider secrets

- Cloudflare secrets, never frontend environment variables
- `.env.example` contains names only
- Secret scanning in CI where available
- Logs redact headers/query keys/tokens

### Data/privacy

- Minimize personal data
- Document retention/deletion
- Avoid sending personal/payment data to free AI providers
- Obtain microphone consent, bound audio size/duration, validate media type, and delete raw
  audio after transcription by default
- Provide delete/disconnect action
- Use pseudonymous identifiers in telemetry

## 18. Initial domain model

Candidate tables/entities; finalize during architecture scaffold:

```text
users
sessions
oauth_accounts
conversations
messages
searches
search_constraints
event_snapshots
recommendations
checkouts
payment_events
reservations
reservation_transitions
tool_invocations
audit_events
provider_health_events
```

Important modeling rules:

- Store Ticketmaster/provider ID and source explicitly.
- Store the normalized event snapshot used for the user decision; do not silently mutate
  historical receipts when upstream data changes.
- Record observed-at timestamps and source freshness.
- Separate payment and reservation state.
- Audit consequential transitions with actor, cause, previous/new state, and correlation ID.
- Conversations reference tool invocations rather than embedding unbounded opaque traces.
- Add indexes only for demonstrated query paths.

## 19. Candidate API surface

Version endpoints and define OpenAPI/typed contracts early. Candidate routes:

```text
GET    /api/v1/health
GET    /api/v1/readiness
POST   /api/v1/conversations
POST   /api/v1/conversations/:id/messages
POST   /api/v1/voice/transcriptions
POST   /api/v1/voice/speech
GET    /api/v1/events/search
GET    /api/v1/events/:provider/:id
POST   /api/v1/recommendations
POST   /api/v1/checkouts
GET    /api/v1/checkouts/:id
POST   /api/v1/stripe/webhook
GET    /api/v1/reservations
GET    /api/v1/reservations/:id
POST   /api/v1/reservations/:id/cancel
GET    /api/v1/ops/summary
GET    /api/v1/ops/tool-invocations
GET    /api/v1/ops/provider-health
```

Do not implement every endpoint before the first vertical slice. This is a boundary map.

## 20. Recommendation approach

Version 1 uses an explainable scoring pipeline, not a learned recommender:

1. Hard filters: geography, date/time, party constraints, status, explicit exclusions.
2. Budget treatment: prefer confirmed price ranges; label unknown price instead of guessing.
3. Weighted preferences: category/genre, time fit, distance, price fit, artist/venue preference.
4. Diversity pass: avoid returning five near-identical events.
5. LLM explanation: describe the already-calculated evidence without changing source facts.

Persist score components so operations and tests can explain why an event ranked above
another. Later user feedback can adjust simple weights. A collaborative-filtering service is
not justified until there is meaningful multi-user interaction data.

## 21. Testing and quality strategy

### Unit tests

- Constraint validation/normalization
- Ranking and tie-breaking
- State machines and invariants
- Idempotency behavior
- Authorization/ownership
- Price/missing-data display rules
- Provider error mapping

### Provider contract tests

Run the same behavior suite against fixture adapters and real sandbox/dev adapters where
safe. Verify normalized outputs rather than provider SDK internals.

### Integration tests

- D1 repositories and migrations
- Ticketmaster fixture normalization
- AI structured-output rejection/retry/fallback
- Speech transcription/TTS success, malformed audio, duration limits, and quota fallback
- Stripe signed webhook and replay/out-of-order cases

### End-to-end tests

- Search -> select -> confirm -> Stripe test checkout -> webhook -> saved plan
- Push-to-talk -> editable transcript -> governed agent response -> optional spoken playback
- Failed payment
- Duplicate webhook
- Cancellation/refund
- AI quota exhausted -> deterministic search remains usable
- Ticketmaster unavailable -> labeled fixture experience
- Google authorization denied/expired
- Mobile and keyboard-accessible golden path

### AI evaluations

Maintain a versioned corpus of requests covering:

- Clear and underspecified intent
- Date ambiguity and time zones
- Budget and party size
- Conflicting constraints
- Prompt injection/provider-text injection
- Missing price/image/venue fields
- No results
- Tool timeout and malformed structured output

Measure extraction accuracy, unsupported-claim rate, tool-selection validity, fallback rate,
latency, and cost/quota consumption. Do not rely only on “looks good” manual testing.

### Quality gates

- Typecheck
- Lint/format
- Unit/integration tests
- Production build
- Migration validation
- Secret scan
- Dependency/security audit with reviewed exceptions
- Playwright smoke test against preview deployment where feasible

## 22. Delivery plan and senior-development sequence

### Phase 0: pivot and prepare

Outcome: obsolete code is removed and the repository is ready for evidence-first development.

- Handoff created and approved as the working source of truth
- SupportIQ deletion explicitly approved and completed; Git history is the recovery path
- Use Scout as the provisional internal name pending a public-name check
- Create each free account only when its implementation phase requires it
- Select the launch city only after the data spike

Verification: the working tree contains no SupportIQ application or generated artifacts.

### Phase 1: Ticketmaster data-quality spike — complete 2026-08-13

Outcome: evidence confirms or rejects the event vertical.

- Minimal script/test harness using server-side key
- Query three cities/30-day windows
- Generate metrics and sanitized samples
- Document provider quirks and normalized contract
- Make explicit go/no-go decision

Verification: repeatable report meets acceptance gates or records the pivot reason.

Result: **GO**. Boston, New York, and Philadelphia passed every initial acceptance gate. New
York is the selected launch city. Evidence is stored in
`reports/ticketmaster/data-quality-report.md`, `data-quality-report.json`,
`sanitized-samples.json`, and `manual-image-review.md`. The repeatable harness is available as
`npm run spike:ticketmaster`, and its five behavioral tests pass with `npm test`.

### Phase 2: engineering foundation — complete 2026-08-13

Outcome: deployable empty product skeleton with CI.

- TypeScript workspace and package boundaries
- React/Hono/Worker scaffold
- Accessible responsive shell and design tokens, informed by selected Beautiful UI primitives
- Environment validation and secret inventory
- D1 schema/migrations/repository conventions
- Provider interfaces and fixture adapters
- Structured errors, request IDs, logs, health/readiness
- Vitest, Playwright, formatting, linting, typecheck, CI
- Architecture decision records

Verification: clean clone can install, test, build, migrate locally, and serve health/UI.

Result: **COMPLETE**. The npm workspace separates the React UI, Hono Worker edge, and
provider-neutral core. The same-origin local Worker serves an accessible responsive shell and
versioned health/readiness API with validated bindings, request IDs, structured errors, and
JSON logs. Ordered D1 migrations establish audit/provider-health storage and repository
conventions. Fixture event contracts, unit/API tests, desktop/mobile Playwright smoke tests,
formatting, linting, typechecking, secret scanning, dry-run Worker builds, and GitHub Actions
are in place. A clean `npm ci`, local migration, full quality check, live health/readiness
requests, and both browser projects passed. No Cloudflare account or paid service was required.

### Phase 3: deterministic live-discovery slice — complete 2026-08-13

Outcome: a user can search and inspect real events without AI.

- Ticketmaster adapter
- Structured constraints form
- Normalized event cards/details
- Ranking and score explanations
- Empty/error/rate-limited states
- Provider freshness/source labels
- Fixture fallback

Verification: real and fixture contract tests plus browser journey.

Result: **COMPLETE**. The Worker validates bounded New York searches before provider use and
keeps the Ticketmaster key server-only. The Ticketmaster adapter builds documented, bounded
Discovery API requests and normalizes provider facts without filling missing values. Domain
code filters cancelled/postponed/rescheduled, out-of-window, category-mismatched, and known
over-budget events; applies stable explainable scoring and duplicate removal; and limits the
response to 12 cards. Missing/rejected credentials, rate limits, invalid responses, and outages
fall back to visibly labeled demo fixtures, while legitimate empty live responses stay empty.
The responsive UI covers structured constraints, loading/error/empty states, live/fixture
source and freshness labels, optional prices, score reasons, expandable details, and provider
links. Unit/API/provider tests, a real bounded Ticketmaster request, and desktop/mobile browser
journeys passed. The source contract and checks are recorded in `docs/DISCOVERY_ACCEPTANCE.md`.

### Phase 4: durable plan and commerce state machine — complete 2026-08-13

Outcome: selected events create durable drafts and safe transitions.

- Users/sessions
- Saved plans
- Checkout/reservation/payment/audit entities
- State-machine invariants and idempotency
- My Plans UI

Verification: transition tests include invalid, repeated, and concurrent-looking operations.

Result: **COMPLETE**. Scout now issues opaque HttpOnly guest-session cookies and stores only
their hashes in D1. A selected normalized event can be saved through the versioned plans API
as a guest-owned draft whose immutable snapshot preserves provider facts, freshness, price
uncertainty, and ranking evidence. Draft creation atomically writes the snapshot, reservation,
initial transition, and correlated audit event; owner/idempotency-key replays return the
existing draft. The migration also establishes constrained checkout and payment-event records
for Phase 5 without creating payment behavior early. Pure checkout and reservation state
machines reject invalid edges and stale versions while treating known operation IDs as safe
replays. My Plans persists across reloads and clearly states that drafts are not reservations,
tickets, or purchases. Unit/API tests, local D1 migration, production builds, and desktop/mobile
browser journeys passed. The contract and evidence are recorded in `docs/PLANS_ACCEPTANCE.md`.

### Phase 5: Stripe sandbox

Outcome: a test payment drives a reservation through a verified webhook.

- Stripe test checkout
- Signed webhook endpoint
- Success/failure/expiry/replay handling
- Simulated cancellation/refund
- Persistent demo receipt

Verification: complete Playwright/test-mode journey and webhook replay tests.

### Phase 6: AI orchestration

Outcome: natural language can drive the existing deterministic use cases safely.

- Workers AI adapter
- Structured preference extraction
- Bounded orchestration loop
- Read-tool calls and explicit confirmation gate
- Context summarization
- Quota/failure fallback
- AI evaluation corpus and metrics

Verification: eval thresholds are documented and deterministic workflow remains functional
with the AI provider disabled.

### Phase 7: voice and lifecycle parity

Outcome: the user can complete the same governed discovery flow by voice and receive useful
post-reservation assistance.

- Microphone permission and push-to-talk recording capped at 30 seconds
- Whisper transcription with editable review
- Same conversation/orchestration path for typed and transcribed input
- Optional TTS playback capped at 600 characters with stop, replay, mute, and text parity
- No raw-audio persistence by default
- Preference-profile persistence and correction controls
- Saved-event status refresh for cancellation/reschedule information
- Proactive in-app alerts and an inspectable request-help/escalation record
- Responsive installable PWA behavior

Verification: microphone denial, silence, unsupported format, transcription failure, quota
exhaustion, edited transcript, spoken-response controls, typed fallback, event-status change,
and escalation workflows are covered without weakening confirmation or authorization.

### Phase 8: operations and observability

Outcome: reviewer can inspect how the agent and transaction behaved.

- Operations summary
- Tool invocation timeline
- Provider/model latency and failures
- Reservation transition/audit views
- Cloudflare traces/logs
- Optional local OTel Collector + Jaeger profile

Verification: one correlation ID connects the golden path and no sensitive fields appear.

### Phase 9: production hardening and public release

Outcome: stable resume link and reproducible repository.

- Accessibility/responsive review
- Abuse/rate-limit controls
- Security/threat-model review
- Preview/production environments
- Deployment smoke tests and rollback/runbook
- Architecture diagram and truthful limitations
- Seeded/fixture demo mode
- Recruiter demo script and screenshots
- Final README and resume bullets

Verification: a new reviewer can use the public URL and a clean clone without private help.

### Phase 10: optional breadth, only after completion

- Gemini provider adapter and comparative eval dashboard
- Container portability profile
- Local kind/k3d + tested Helm chart for platform-role demonstrations
- OpenAPI client generation
- A deliberately isolated SOAP adapter exercise only if a target job requires it
- Additional event providers after legal/terms review

## 23. Free accounts and credentials

Account creation is **just in time**, not an upfront prerequisite. When a phase first needs
an external provider, the developer will pause, explain why the account is needed, guide the
owner through its official setup flow step by step, and verify the integration without asking
the owner to paste secrets into chat. This avoids unnecessary signups and stale credentials.

Required when their respective phases begin:

1. Ticketmaster Developer account/API key
2. Cloudflare account with Workers, D1, and Workers AI access
3. Stripe account in test mode
4. GitHub account/repository and Actions

Optional:

- Google AI Studio/Gemini API key
- Anthropic account only if the owner later accepts non-durable trial credits or paid usage

Recommended secret names, subject to implementation:

```text
TICKETMASTER_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
GEMINI_API_KEY              # optional
```

Never paste credentials into chat, issues, screenshots, source files, committed `.env`, or
handoff documentation. Configure them through local ignored files and Cloudflare secrets.

## 24. Cost controls and failure policy

The target is $0, not merely “probably inexpensive.”

- Do not attach paid fallbacks without explicit approval.
- Prefer services whose free quota fails closed instead of auto-billing.
- Set provider/application rate limits below external quotas.
- Display degraded state rather than retrying indefinitely.
- Bound AI context, output, and tool loops.
- Keep a fixture demo that never masquerades as live data.
- Recheck all free-tier terms before deployment; they are temporal, not architectural facts.
- Document any provider requiring a billing account even if expected usage is free.
- Use the free Cloudflare subdomain; a custom domain is outside the $0 constraint.

## 25. Production replacement path

The application should make paid upgrades understandable, but never claim they are trivial.

Potential replacements:

| Portfolio provider            | Commercial replacement category                                                 |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Ticketmaster Discovery        | Ticketmaster Partner API, affiliate feeds, other contracted inventory providers |
| Internal demo reservation     | Provider inventory hold/order/ticket issuance service                           |
| Stripe test mode              | Stripe live mode with tax, fraud, reconciliation, disputes, and compliance      |
| D1                            | Managed PostgreSQL/compatible operational database when workload requires it    |
| Workers AI/Gemini free        | Contracted model provider with privacy/SLA/capacity controls                    |
| Native short-retention traces | Managed OTel-compatible observability backend                                   |
| In-app confirmation           | Transactional email/SMS/push provider                                           |

Commercial launch also requires contracts, fee/tax correctness, fraud controls, chargebacks,
refund/service operations, privacy/retention policies, customer support, backups, incident
response, capacity testing, accessibility/legal review, and SLAs.

## 26. Definition of done

The project is portfolio-complete when all are true:

- Public zero-cost URL works.
- Live Ticketmaster results are visibly distinguished from fixtures.
- Natural-language and structured discovery both work.
- Push-to-talk input, editable transcription, spoken-response controls, and typed fallback work.
- Results are normalized, ranked, explainable, and honest about missing data.
- AI can fail without breaking the core application.
- User confirmation precedes consequential actions.
- Stripe test checkout and verified webhook create a durable demo reservation.
- Replays and invalid transitions are safe.
- My Plans supports cancellation/refund simulation.
- Saved plans preserve preferences and surface provider-reported event status changes.
- In-app alerts and the request-help workflow are honest about having no staffed human service.
- Operations view exposes tool calls, provider failures, and audit state without secrets.
- Automated unit, integration, contract, AI-eval, and golden-path tests exist.
- CI builds and tests the product.
- Cloud deployment, local development, and optional Docker workflow are documented.
- Architecture and limitations are honest.
- No paid service is required for the normal demo.
- A clean clone and a recruiter can reproduce the documented experience.

## 27. Decisions still requiring owner approval

Recommended defaults are included so implementation does not stall unnecessarily.

1. **Working name**: use Scout internally until a public-name check; avoid spending time on
   branding before the data spike.
2. **Authentication**: guest discovery plus an authenticated persistent account is the likely
   simplest flow; exact identity provider and auth library are implementation decisions.
3. **Gemini adapter**: recommended Phase 10 resume enhancement, not a launch dependency.
4. **Kubernetes/Helm**: optional tested local portability profile only after the public product
   is complete.

## 28. Decision log

### 2026-08-13 — Pivot away from SupportIQ

Decision: build a consumer action-taking vertical agent rather than continue the telecom
support simulator. Reason: the target portfolio needs real public data, a consumer journey,
commerce behavior, and a production-shaped deployment.

### 2026-08-13 — Delete the obsolete prototype

Decision: remove SupportIQ source, policies, dependencies, documentation, database, and
generated artifacts from the working tree rather than archiving them alongside Scout. Reason:
the pivot is final, the two products are unrelated, and retaining the old structure would
confuse future developers and reviewers. Previously committed source remains recoverable from
Git history.

### 2026-08-13 — Select events as the provisional vertical

Decision: prefer local events over flights/hotels. Reason: Ticketmaster provides credible
live discovery data without the commercial fulfillment dependencies of travel. This remains
conditional on the data-quality spike.

### 2026-08-13 — Live discovery plus simulated fulfillment

Decision: use real Ticketmaster discovery, Stripe test mode, and an internal clearly labeled
demo reservation. Reason: it demonstrates the transaction architecture without false ticketing
claims or real charges.

### 2026-08-13 — Add voice and Navan-inspired lifecycle parity

Decision: version 1 includes turn-based push-to-talk input, Cloudflare-hosted speech
transcription, an editable transcript, and optional spoken responses through the same governed
conversation runtime. It also includes preference memory, saved-event status refresh, proactive
in-app alerts, a request-help/escalation record, and responsive PWA behavior. Do not claim
full-duplex calling, autonomous venue calls, expense capture, native mobile, or staffed human
support. Reason: these additions reproduce the relevant Navan-like consumer interaction and
lifecycle pattern without importing unrelated travel/finance scope or violating the $0 goal.

### 2026-08-13 — Modular monolith

Decision: one deployable with explicit modules and provider ports. Reason: one developer and
one workload do not justify distributed-system cost. Preserve extraction seams.

### 2026-08-13 — Cloudflare primary cloud

Decision: use Workers, D1, Workers AI, and native observability for the public deployment.
Reason: coherent zero-cost quotas and minimal operations for a public feasibility product.
Official pricing was rechecked on this date: static assets are free/unlimited; Workers,
D1, and Workers AI have explicit free quotas that fail when exhausted. Never enable Workers
Paid or an unverified paid binding. Vercel Hobby remains a viable frontend alternative, while
Render Free is rejected because services sleep and free PostgreSQL expires after 30 days.

### 2026-08-13 — Google terminology clarification and Calendar removal

Decision: distinguish Google Cloud (the AWS/Azure-like cloud platform), gRPC (the RPC
framework initially created by Google), and individual Google service APIs. Remove Google
Calendar entirely because it was introduced through terminology confusion and was never part
of the approved product. Avoid Maps/Places as a required dependency because of billing
requirements. Do not add SOAP, gRPC, GCP, or Gemini merely to collect technology keywords.

### 2026-08-13 — No required Claude API

Decision: keep an AI provider abstraction but do not require Claude. Reason: the consumer
free plan is not dependable programmatic API capacity, and the product must remain $0.

### 2026-08-13 — Kubernetes is optional evidence, not primary infrastructure

Decision: use Docker for reproducibility and local observability. Add a tested local
Kubernetes/Helm profile only after the product is complete and only if platform-role value
justifies the effort.

### 2026-08-13 — Create provider accounts just in time

Decision: do not create all external accounts upfront. When an active implementation phase
requires Ticketmaster, Cloudflare, Stripe, Google, or an optional provider, guide the owner
through that account’s official setup flow step by step. Never request that secrets be pasted
into chat; configure them through ignored local environment files or provider secret stores.
Reason: this minimizes unnecessary accounts, avoids stale configuration, and keeps setup tied
to an immediately verifiable integration.

### 2026-08-13 — Ticketmaster spike passes; select New York launch city

Decision: proceed with the events vertical and use New York City as the initial launch city.
The repeatable 30-day spike reported 3,579 New York events, sampled the 1,000-event public API
deep-paging limit, found 50 categories/subcategories, 100% venue/date/provider-URL completeness,
824 demo-suitable events, and 101 demo-suitable events with provider price ranges. Boston and
Philadelphia also passed every initial gate, but New York provided the deepest inventory and
largest price-bearing demo pool. Price ranges remain sparse and non-authoritative, so missing
price is a required product state and no final price may be inferred.

### 2026-08-13 — Use Beautiful UI as a free, attributed component source

Decision: use selected Beautiful UI primitives and visual patterns during Phase 2 and later UI
work. The project's official license page states that its component software is MIT-licensed,
so it can be used, modified, and distributed at no cost provided the copyright and permission
notice are retained. Scout will adapt relevant chat, search, recommendation, approval,
loading/thinking, tool, and records patterns rather than clone Beautiful UI's branding or
showcase. Add a third-party notices file when the first component source is copied.

### 2026-08-13 — Complete the Phase 2 modular-monolith foundation

Decision: use one npm workspace with `apps/web`, `apps/worker`, and `packages/core`; serve the
built React assets and `/api/*` from one Cloudflare Worker; keep D1 adapters at the runtime edge;
and create only the cross-cutting audit and provider-health tables before feature-specific
vertical slices need more state. Reason: this gives Scout deployable, tested boundaries without
premature domain tables or distributed services. The shell uses Scout-specific design tokens;
no Beautiful UI source has been copied yet, so its third-party notice is not yet triggered.

### 2026-08-13 — Complete deterministic discovery before persistence

Decision: keep launch discovery constrained to New York, at most 30 days, one bounded
Ticketmaster page, and 12 ranked results. Treat category, time, known provider price, status,
and source completeness as deterministic evidence. Keep unknown price/status fields explicit;
do not infer availability from party size. On provider configuration or availability failure,
return clearly labeled fixtures with a machine-readable reason instead of making the core
journey unusable. Reason: this proves the provider seam and honest recommendation behavior
before Phase 4 introduces users, saved plans, or transaction state.

### 2026-08-13 — Complete durable guest plans before Stripe

Decision: represent a saved plan as a guest-owned reservation aggregate in `draft` state,
backed by an immutable normalized event snapshot. Use a server-issued opaque HttpOnly cookie
for guest continuity, persist only its SHA-256 hash, batch the initial transition and audit
record with draft creation, and make owner/idempotency-key retries replay-safe. Model the
future checkout/payment records and state transitions now, but expose no payment transition
endpoint until verified Stripe test-mode webhooks exist. Reason: this completes an honest,
durable selection journey while preserving a safe boundary between user intent and commerce.

## 29. Immediate next action for a new Codex session

Phase 4 is complete. Do not add AI orchestration, voice, or operations surfaces yet. Begin
Phase 5 by guiding the owner through just-in-time Stripe test-mode account setup; never ask
them to paste a secret into chat.

1. Read this handoff and `docs/PLANS_ACCEPTANCE.md` completely, then inspect the existing
   reservation/checkout state contracts and D1 schema.
2. Explain the required Stripe test-mode account, secret, and webhook setup step by step. Keep
   secrets in ignored local configuration and Cloudflare secret storage only.
3. Add a `PaymentProvider` port and Stripe test adapter without importing Stripe SDK concerns
   into the domain.
4. Create checkout only after an explicit user confirmation and retain the visible sandbox,
   no-real-ticket notice.
5. Advance payment and reservation state only from a signature-verified webhook using atomic
   version predicates and replay-safe provider event IDs.
6. Cover success, failure, expiry, duplicate/out-of-order webhook, cancellation, refund, and
   persistent demo-receipt behavior with unit, integration, and browser tests.
