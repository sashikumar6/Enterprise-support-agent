# ADR 0002: D1 persistence conventions

- Status: accepted
- Date: 2026-08-13

## Context

Scout needs durable state on the zero-cost Cloudflare deployment while keeping domain behavior
portable and schema changes reviewable.

## Decision

- Store ordered, immutable SQL migrations in `migrations/`.
- Use lowercase plural table names and snake_case columns.
- Represent identifiers and ISO-8601 timestamps as text at boundaries.
- Put repository interfaces beside application-facing records; keep D1 implementations in
  `apps/worker/src/persistence`.
- Enforce stable invariants with database constraints and behavior rules in domain code.
- Add indexes only for documented query paths.
- Store structured audit details as validated JSON and never include secrets or raw sensitive
  prompts.

The foundation creates only audit and provider-health tables because those are cross-cutting
requirements. Feature tables arrive with the vertical slice that proves their behavior.

## Consequences

D1 remains replaceable at the domain boundary, while SQL portability is not falsely promised.
Migration validation is part of local and CI acceptance.
