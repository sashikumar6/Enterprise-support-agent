# Ticketmaster data-quality spike

Generated: 2026-08-14T01:57:24.264Z

Window: 2026-08-14T01:57:12Z through 2026-09-13T01:57:12Z

## Decision

**GO — continue with the event vertical and use New York as the launch city. All passing candidates: Boston, New York, Philadelphia.**

The automated image check treats a non-placeholder image at least 640 px wide as useful. Generic artwork can only be confirmed by manual visual review. Price ranges are optional provider data and are not treated as final checkout prices.

| City | Reported | Analyzed | Categories | Core complete | Price present | Useful image | Demo-suitable | Duplicate rate | Gates |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Boston | 445 | 445 | 33 | 100% | 1.6% | 100% | 437 | 0.4% | PASS |
| New York | 3579 | 1000 | 50 | 100% | 10.2% | 100% | 824 | 4.8% | PASS |
| Philadelphia | 229 | 229 | 49 | 100% | 10.5% | 100% | 204 | 0.4% | PASS |

## Boston

- Provider-reported events: 445
- Events analyzed: 445
- Coordinate completeness: 100%
- Missing-image rate: 0%
- Potential fallback-image rate: 0%
- Statuses: {"onsale":440,"cancelled":4,"rescheduled":1}
- Problem status events: 5
- Checkout-suitable events with provider price data: 7
- Requests: 3; failures: 0; average latency: 528 ms; maximum latency: 744 ms

Top categories:

- Sports > Hockey > NHL: 175
- Sports > Miscellaneous > Miscellaneous: 103
- Music > Rock > Pop: 19
- Music > Hip-Hop/Rap > Trap: 17
- Music > Dance/Electronic > Amapiano: 16
- Arts & Theatre > Comedy > Comedy: 15
- Sports > Baseball > MLB: 14
- Music > Rock > Alternative Rock: 12
- Music > Pop > Electro Pop: 11
- Music > Country > Country: 9
- Music > Other > Other: 9
- Music > Jazz > Latin Jazz: 6

## New York

- Provider-reported events: 3579
- Events analyzed: 1000
- Coordinate completeness: 100%
- Missing-image rate: 0%
- Potential fallback-image rate: 0%
- Statuses: {"onsale":993,"offsale":3,"cancelled":4}
- Problem status events: 4
- Checkout-suitable events with provider price data: 101
- Requests: 5; failures: 0; average latency: 519 ms; maximum latency: 568 ms

Top categories:

- Arts & Theatre > Theatre > Musical: 274
- Arts & Theatre > Fine Art > Fine Art: 160
- Arts & Theatre > Miscellaneous > Miscellaneous: 88
- Arts & Theatre > Theatre > Comedy: 52
- Miscellaneous: 46
- Music > Jazz > Jazz: 24
- Music > Other: 20
- Arts & Theatre > Theatre > Drama: 18
- Arts & Theatre > Performance Art > Performance Art: 18
- Arts & Theatre > Theatre > Miscellaneous: 16
- Music > Rock > Pop: 13
- Music > Jazz > Big Band: 10

## Philadelphia

- Provider-reported events: 229
- Events analyzed: 229
- Coordinate completeness: 100%
- Missing-image rate: 0%
- Potential fallback-image rate: 0%
- Statuses: {"onsale":222,"cancelled":4,"offsale":2,"rescheduled":1}
- Problem status events: 5
- Checkout-suitable events with provider price data: 24
- Requests: 2; failures: 0; average latency: 429 ms; maximum latency: 607 ms

Top categories:

- Arts & Theatre > Comedy > Comedy: 35
- Music > Other > Other: 22
- Music > Hip-Hop/Rap > Trap: 17
- Sports > Baseball > MLB: 13
- Music > Pop > Electro Pop: 10
- Miscellaneous > Community/Civic > Community/Civic: 10
- Music > Rock > Alternative Rock: 9
- Music > Rock > Pop: 8
- Miscellaneous: 8
- Music > Alternative > Alternative: 7
- Music > Alternative > Alternative Rock: 5
- Arts & Theatre > Performance Art > Performance Art: 5
