# Phase 3 discovery acceptance

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
- `partySize=1..12`
- optional `budgetMax=1..10000`
- `mode=live|fixture`

Live mode calls Ticketmaster only from the Worker. Fixture mode is deliberate and always
labeled. The UI never claims all local events, exact inventory, final fees, ticket issuance,
or purchasing capability.
