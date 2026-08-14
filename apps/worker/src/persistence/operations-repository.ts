import type {
  OperationsRecorder,
  OperationsRepository,
  OperationsTimelineItem,
} from "@scout/core";

const safeDetailKeys = new Set([
  "mode",
  "outcome",
  "reservationId",
  "staffedService",
  "requestedMode",
  "providerMode",
  "resultCount",
  "modelUsed",
  "toolCount",
  "characters",
  "persistedRawAudio",
  "checked",
  "changes",
]);

function safeDetails(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, item]) =>
          safeDetailKeys.has(key) &&
          (item === null ||
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean"),
      ),
    ) as Record<string, string | number | boolean | null>;
  } catch {
    return {};
  }
}

export class D1OperationsRepository
  implements OperationsRepository, OperationsRecorder
{
  constructor(
    private readonly database: D1Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async summary() {
    const [counts, states, recent] = await Promise.all([
      this.database
        .prepare(
          `SELECT
             (SELECT count(*) FROM reservations) AS reservations,
             (SELECT count(*) FROM checkouts) AS checkouts,
             (SELECT count(*) FROM payment_events) AS payment_events,
             (SELECT count(*) FROM audit_events) AS audit_events,
             (SELECT count(*) FROM tool_invocations) AS tool_invocations,
             (SELECT count(*) FROM provider_health_events) AS provider_health_events`,
        )
        .first<Record<string, number>>(),
      this.database
        .prepare(
          `SELECT state, count(*) AS count FROM reservations GROUP BY state ORDER BY state`,
        )
        .all<{ state: string; count: number }>(),
      this.database
        .prepare(
          `SELECT max(occurred_at) AS occurred_at FROM (
             SELECT occurred_at FROM audit_events
             UNION ALL SELECT occurred_at FROM reservation_transitions
             UNION ALL SELECT received_at AS occurred_at FROM payment_events
             UNION ALL SELECT occurred_at FROM tool_invocations
             UNION ALL SELECT observed_at AS occurred_at FROM provider_health_events
           )`,
        )
        .first<{ occurred_at: string | null }>(),
    ]);
    return {
      counts: {
        reservations: counts?.reservations ?? 0,
        checkouts: counts?.checkouts ?? 0,
        paymentEvents: counts?.payment_events ?? 0,
        auditEvents: counts?.audit_events ?? 0,
        toolInvocations: counts?.tool_invocations ?? 0,
        providerHealthEvents: counts?.provider_health_events ?? 0,
      },
      reservationStates: Object.fromEntries(
        states.results.map((row) => [row.state, row.count]),
      ),
      recentActivityAt: recent?.occurred_at ?? null,
    };
  }

  async timeline(input: { correlationId: string | null; limit: number }) {
    const filter = input.correlationId ? " WHERE correlation_id = ?" : "";
    const bind = (statement: D1PreparedStatement) =>
      input.correlationId
        ? statement.bind(input.correlationId, input.limit)
        : statement.bind(input.limit);
    const [audits, tools, providers, transitions, payments] = await Promise.all(
      [
        bind(
          this.database.prepare(
            `SELECT id, occurred_at, correlation_id, action, subject_type, subject_id, details_json
             FROM audit_events${filter} ORDER BY occurred_at DESC LIMIT ?`,
          ),
        ).all<Record<string, string>>(),
        bind(
          this.database.prepare(
            `SELECT id, occurred_at, correlation_id, tool_name, provider, status, latency_ms, metadata_json
             FROM tool_invocations${filter} ORDER BY occurred_at DESC LIMIT ?`,
          ),
        ).all<Record<string, string | number | null>>(),
        bind(
          this.database.prepare(
            `SELECT id, observed_at, correlation_id, provider, status, latency_ms, failure_category
             FROM provider_health_events${filter} ORDER BY observed_at DESC LIMIT ?`,
          ),
        ).all<Record<string, string | number | null>>(),
        bind(
          this.database.prepare(
            `SELECT id, occurred_at, correlation_id, cause, reservation_id, previous_state, new_state
             FROM reservation_transitions${filter} ORDER BY occurred_at DESC LIMIT ?`,
          ),
        ).all<Record<string, string | null>>(),
        bind(
          this.database.prepare(
            `SELECT id, received_at, correlation_id, event_type, checkout_reference_id, outcome
             FROM payment_events${filter} ORDER BY received_at DESC LIMIT ?`,
          ),
        ).all<Record<string, string | null>>(),
      ],
    );
    const items: OperationsTimelineItem[] = [
      ...audits.results.map((row) => ({
        id: row.id,
        kind: "audit" as const,
        occurredAt: row.occurred_at,
        correlationId: row.correlation_id,
        label: row.action,
        status: null,
        subject: `${row.subject_type}:${row.subject_id}`,
        durationMs: null,
        failureCategory: null,
        details: safeDetails(row.details_json),
      })),
      ...tools.results.map((row) => ({
        id: String(row.id),
        kind: "tool" as const,
        occurredAt: String(row.occurred_at),
        correlationId: String(row.correlation_id),
        label: String(row.tool_name),
        status: String(row.status),
        subject: row.provider === null ? null : String(row.provider),
        durationMs: Number(row.latency_ms),
        failureCategory: null,
        details: safeDetails(String(row.metadata_json)),
      })),
      ...providers.results.map((row) => ({
        id: String(row.id),
        kind: "provider" as const,
        occurredAt: String(row.observed_at),
        correlationId: String(row.correlation_id),
        label: String(row.provider),
        status: String(row.status),
        subject: null,
        durationMs: row.latency_ms === null ? null : Number(row.latency_ms),
        failureCategory:
          row.failure_category === null ? null : String(row.failure_category),
        details: {},
      })),
      ...transitions.results.map((row) => ({
        id: String(row.id),
        kind: "transition" as const,
        occurredAt: String(row.occurred_at),
        correlationId: String(row.correlation_id),
        label: String(row.cause),
        status: String(row.new_state),
        subject: `reservation:${row.reservation_id}`,
        durationMs: null,
        failureCategory: null,
        details: {
          previousState: row.previous_state,
          newState: row.new_state,
        },
      })),
      ...payments.results.map((row) => ({
        id: String(row.id),
        kind: "payment" as const,
        occurredAt: String(row.received_at),
        correlationId: String(row.correlation_id ?? "uncorrelated"),
        label: String(row.event_type),
        status: String(row.outcome),
        subject:
          row.checkout_reference_id === null
            ? null
            : `checkout:${row.checkout_reference_id}`,
        durationMs: null,
        failureCategory: null,
        details: { replayed: row.outcome === "replayed" },
      })),
    ];
    return items
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, input.limit);
  }

  async recordTool(input: Parameters<OperationsRecorder["recordTool"]>[0]) {
    await this.database
      .prepare(
        `INSERT INTO tool_invocations
          (id, occurred_at, tool_name, provider, status, latency_ms, correlation_id, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        this.clock().toISOString(),
        input.name,
        input.provider,
        input.status,
        input.latencyMs,
        input.correlationId,
        JSON.stringify(input.metadata),
      )
      .run();
  }

  async recordProvider(
    input: Parameters<OperationsRecorder["recordProvider"]>[0],
  ) {
    await this.database
      .prepare(
        `INSERT INTO provider_health_events
          (id, provider, observed_at, status, latency_ms, failure_category, correlation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.provider,
        this.clock().toISOString(),
        input.status,
        input.latencyMs,
        input.failureCategory,
        input.correlationId,
      )
      .run();
  }
}
