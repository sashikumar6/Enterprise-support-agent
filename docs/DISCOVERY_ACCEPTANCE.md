# Phase 3 discovery acceptance

Status: **VERIFIED COMPLETE** as of 2026-08-14. The original provider and safety evidence and the
corrective Phase 7A relevance/browser evidence all pass.

Phase 3 is complete when Scout can search and inspect normalized events without AI or any
commerce behavior.

| Capability            | Verification                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Constraint validation | Only New York launch searches with real dates, a maximum 30-day range, supported categories/times, party sizes 1–12, and optional budgets from 1–10,000 reach a provider.            |
| Provider isolation    | `TicketmasterEventProvider` is the only module that knows Ticketmaster response fields or authentication query parameters.                                                           |
| Normalization         | Event, venue, date, classification, image, status, source, freshness, URL, and optional price ranges map to the provider-neutral contract. Missing facts remain `null`.              |
| Deterministic ranking | Hard city/date/category/status/budget rules run before stable score ordering and duplicate removal. Every returned score includes evidence-based reasons.                            |
| Honest price handling | Unknown provider prices remain unknown. Displayed ranges are labeled provider ranges, not final prices.                                                                              |
| Failure behavior      | Missing/rejected credentials, rate limits, invalid responses, and outages degrade to visibly labeled fixture data. Legitimate empty live results remain empty.                       |
| Quota protection      | Search sizes are bounded to 100, paging to page 0, browser submits are explicit, and repeated same-session requests inside 500 ms receive HTTP 429.                                  |
| User journey          | The responsive form renders loading, validation/error, empty, live, and fixture/fallback states; cards expose score reasons, details, source, status, freshness, and provider links. |

## Search API

`GET /api/v1/events/search` accepts:

- `city=New York`
- `startDate` and `endDate` as `YYYY-MM-DD`
- `category=all|music|sports|arts|comedy|family`
- `timePreference=any|daytime|evening`
- optional `exactStartTime=HH:mm`; this means a provider-listed local start within ±30 minutes
- `partySize=1..12`
- optional `budgetMax=1..10000`
- `mode=live|fixture`

Live mode calls Ticketmaster only from the Worker. Fixture mode is deliberate and always
labeled. The UI never claims all local events, exact inventory, final fees, ticket issuance,
or purchasing capability.

## Corrective Phase 7A evidence

The owner approved this exact-time rule on 2026-08-14: “at 5 PM” means a provider-listed event
start from 4:30 PM through 5:30 PM in New York local time. Scout does not infer that an earlier
event is still running at the requested time.

Implemented corrections:

- Exact local time is retained independently from the coarse time preference and runtime-validated
  as 24-hour `HH:mm`.
- Deterministic ranking returns in-window `events` separately from at most three off-window
  `alternatives`, ordered by start-time distance. Unknown start times cannot be alternatives.
- Result-list diversity allows one card per Ticketmaster attraction ID; when the provider omits
  that ID, a normalized title before performance qualifiers is the fallback grouping key. Distinct
  performance records remain provider events and can still be reached through their provider URLs.
- Ticketmaster placeholder classifications such as `Undefined`, `null`, and `unknown` normalize to
  missing facts. Cards render the human label `Unclassified`.
- The structured exact-filter form now accepts an optional exact start time and labels alternatives
  outside the requested window.

Automated regression coverage passes for exact-time validation and boundaries, no-match
separation, nearest ordering, provider-ID/title-fallback diversity, placeholder classification,
relative-date boundaries, and existing provider/fallback behavior. The full repository check
passed with 89 automated tests and production builds; eight desktop/mobile Playwright journeys
also passed.

Live API evidence on 2026-08-14:

- The owner's exact request resolved to `2026-08-14`, `17:00`, and live mode.
- Four exact matches started at 16:30, 17:00, 17:00, and 17:30; no off-window event appeared in
  the exact-match list.
- The separately returned alternatives started at 16:00 or 18:00.
- A live 03:00 probe returned zero exact matches and three separately labeled nearest alternatives.
- Provider attraction identity collapsed two Banksy Museum performance/title variants in that
  alternative list.
- After a follow-up regression, the owner's request, “Find a show in New York under $80 next
  Friday,” resolved consistently to 2026-08-21 in two live runs; all returned event dates were
  2026-08-21. The UI now displays `Fri, Aug 21` in the interpreted-constraint chips.

Interactive browser acceptance on 2026-08-14:

- [x] The owner ran `dev:ai` in an interactive browser and confirmed the visible `Fri, Aug 14`
      and 5:00 PM constraints, in-window exact cards, separately labeled nearest alternatives,
      `Unclassified` fallback, useful attraction grouping, and stable repeated interpretation.
- [x] The owner submitted the paired next-Friday request and confirmed the visible date was
      Friday, August 21, the visible budget was under $80, and the returned dates were correct
      before any save action.
