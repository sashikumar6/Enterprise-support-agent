# ADR 0001: Modular monolith workspace

- Status: accepted
- Date: 2026-08-13

## Context

Scout needs a browser UI, a Cloudflare HTTP runtime, provider-independent business rules, and
a clean path to deterministic tests. It has one developer and one deployable workload.

## Decision

Use one npm workspace and one deployable Cloudflare application:

- `apps/web` owns React presentation and browser interaction.
- `apps/worker` owns HTTP, runtime bindings, structured logs/errors, and persistence adapters.
- `packages/core` owns domain types, provider ports, and deterministic fixture adapters.
- `migrations` owns ordered D1 SQL migrations.

The Worker serves the built web assets and handles `/api/*` first, keeping UI and API
same-origin. Domain code cannot import Cloudflare, Ticketmaster, Stripe, or model SDKs.

## Consequences

The code has explicit replaceable seams without distributed deployment overhead. Cloudflare
types stay at the application edge. A future service extraction remains possible, but must be
justified by measured scaling, security, ownership, or release needs.
