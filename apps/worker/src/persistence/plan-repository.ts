import type {
  CheckoutCandidate,
  CheckoutLaunch,
  CancellationCandidate,
  CancellationResult,
  CommerceRepository,
  CreateDraftPlan,
  CreateDraftPlanResult,
  PlanRepository,
  RankedEvent,
  SavedPlan,
  PaymentWebhookEvent,
  StartCancellation,
  StartCheckout,
} from "@scout/core";

interface PlanRow {
  id: string;
  state: SavedPlan["state"];
  version: number;
  created_at: string;
  updated_at: string;
  snapshot_json: string;
  checkout_id: string | null;
  checkout_state: CheckoutLaunch["state"] | null;
  refund_state: CheckoutLaunch["refundState"] | null;
  amount_minor: number | null;
  currency: string | null;
  completed_at: string | null;
  provider_payment_id: string | null;
}

function mapPlan(row: PlanRow): SavedPlan {
  return {
    id: row.id,
    state: row.state,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    event: JSON.parse(row.snapshot_json) as RankedEvent,
    checkout:
      row.checkout_id &&
      row.checkout_state &&
      row.refund_state &&
      row.amount_minor !== null &&
      row.currency
        ? {
            id: row.checkout_id,
            state: row.checkout_state,
            refundState: row.refund_state,
            amountMinor: row.amount_minor,
            currency: row.currency,
            completedAt: row.completed_at,
            providerPaymentId: row.provider_payment_id,
          }
        : null,
  };
}

const planSelect = `SELECT r.id, r.state, r.version, r.created_at, r.updated_at,
  e.snapshot_json, c.id AS checkout_id, c.state AS checkout_state,
  c.refund_state, c.amount_minor, c.currency, c.completed_at,
  c.provider_payment_id
 FROM reservations r
 JOIN event_snapshots e ON e.id = r.event_snapshot_id
 LEFT JOIN checkouts c ON c.id = (
   SELECT latest.id FROM checkouts latest
   WHERE latest.reservation_id = r.id
   ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
 )`;

interface CheckoutRow {
  id: string;
  reservation_id: string;
  state: CheckoutLaunch["state"];
  refund_state: CheckoutLaunch["refundState"];
  amount_minor: number;
  currency: string;
  completed_at: string | null;
  provider_payment_id: string | null;
  provider_url: string;
}

function mapCheckoutLaunch(row: CheckoutRow): CheckoutLaunch {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    state: row.state,
    refundState: row.refund_state,
    amountMinor: row.amount_minor,
    currency: row.currency,
    completedAt: row.completed_at,
    providerPaymentId: row.provider_payment_id,
    redirectUrl: row.provider_url,
  };
}

export class D1PlanRepository implements PlanRepository, CommerceRepository {
  constructor(
    private readonly database: D1Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async findByIdempotency(
    ownerSessionId: string,
    idempotencyKey: string,
  ) {
    const row = await this.database
      .prepare(
        `${planSelect}
         WHERE r.owner_session_id = ? AND r.idempotency_key = ?`,
      )
      .bind(ownerSessionId, idempotencyKey)
      .first<PlanRow>();
    return row ? mapPlan(row) : null;
  }

  async createDraft(command: CreateDraftPlan): Promise<CreateDraftPlanResult> {
    const existing = await this.findByIdempotency(
      command.ownerSessionId,
      command.idempotencyKey,
    );
    if (existing) return { plan: existing, replayed: true };

    const now = this.clock().toISOString();
    const snapshotId = crypto.randomUUID();
    const planId = crypto.randomUUID();
    const transitionId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const statements = [
      this.database
        .prepare(
          `INSERT INTO event_snapshots
            (id, provider, provider_event_id, observed_at, snapshot_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          snapshotId,
          command.event.source,
          command.event.id,
          command.event.observedAt,
          JSON.stringify(command.event),
          now,
        ),
      this.database
        .prepare(
          `INSERT INTO reservations
            (id, owner_session_id, event_snapshot_id, state, version, idempotency_key, created_at, updated_at)
           VALUES (?, ?, ?, 'draft', 0, ?, ?, ?)`,
        )
        .bind(
          planId,
          command.ownerSessionId,
          snapshotId,
          command.idempotencyKey,
          now,
          now,
        ),
      this.database
        .prepare(
          `INSERT INTO reservation_transitions
            (id, reservation_id, operation_id, previous_state, new_state, version, actor_session_id, cause, correlation_id, occurred_at)
           VALUES (?, ?, ?, NULL, 'draft', 0, ?, 'event_selected', ?, ?)`,
        )
        .bind(
          transitionId,
          planId,
          `${command.ownerSessionId}:${command.idempotencyKey}`,
          command.ownerSessionId,
          command.correlationId,
          now,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_events
            (id, occurred_at, actor_id, action, subject_type, subject_id, correlation_id, details_json)
           VALUES (?, ?, ?, 'plan.draft_created', 'reservation', ?, ?, ?)`,
        )
        .bind(
          auditId,
          now,
          command.ownerSessionId,
          planId,
          command.correlationId,
          JSON.stringify({
            provider: command.event.source,
            providerEventId: command.event.id,
          }),
        ),
    ];

    try {
      await this.database.batch(statements);
    } catch (error) {
      const replay = await this.findByIdempotency(
        command.ownerSessionId,
        command.idempotencyKey,
      );
      if (replay) return { plan: replay, replayed: true };
      throw error;
    }

    return {
      replayed: false,
      plan: {
        id: planId,
        state: "draft",
        version: 0,
        createdAt: now,
        updatedAt: now,
        event: command.event,
        checkout: null,
      },
    };
  }

  async listForOwner(ownerSessionId: string) {
    const rows = await this.database
      .prepare(
        `${planSelect}
         WHERE r.owner_session_id = ?
         ORDER BY r.updated_at DESC, r.id DESC`,
      )
      .bind(ownerSessionId)
      .all<PlanRow>();
    return rows.results.map(mapPlan);
  }

  async findCheckoutCandidate(
    ownerSessionId: string,
    reservationId: string,
  ): Promise<CheckoutCandidate | null> {
    const row = await this.database
      .prepare(
        `SELECT r.id AS reservation_id, r.version AS reservation_version,
                json_extract(e.snapshot_json, '$.name') AS event_name
         FROM reservations r
         JOIN event_snapshots e ON e.id = r.event_snapshot_id
         WHERE r.id = ? AND r.owner_session_id = ? AND r.state = 'draft'`,
      )
      .bind(reservationId, ownerSessionId)
      .first<{
        reservation_id: string;
        reservation_version: number;
        event_name: string;
      }>();
    return row
      ? {
          reservationId: row.reservation_id,
          reservationVersion: row.reservation_version,
          eventName: row.event_name,
        }
      : null;
  }

  async findCheckoutLaunch(
    ownerSessionId: string,
    reservationId: string,
    idempotencyKey: string,
  ): Promise<CheckoutLaunch | null> {
    const row = await this.database
      .prepare(
        `SELECT c.id, c.reservation_id, c.state, c.refund_state,
                c.amount_minor, c.currency, c.completed_at,
                c.provider_payment_id, c.provider_url
         FROM checkouts c
         JOIN reservations r ON r.id = c.reservation_id
         WHERE r.owner_session_id = ? AND c.reservation_id = ?
           AND c.idempotency_key = ?`,
      )
      .bind(ownerSessionId, reservationId, idempotencyKey)
      .first<CheckoutRow>();
    return row ? mapCheckoutLaunch(row) : null;
  }

  async startCheckout(command: StartCheckout): Promise<CheckoutLaunch> {
    const existing = await this.findCheckoutLaunch(
      command.ownerSessionId,
      command.reservationId,
      command.idempotencyKey,
    );
    if (existing) return existing;

    const now = this.clock().toISOString();
    try {
      await this.database
        .prepare(
          `INSERT INTO checkouts
            (id, reservation_id, state, version, provider_checkout_id,
             idempotency_key, provider_url, expires_at, amount_minor, currency,
             initiated_by_session_id, correlation_id, expected_reservation_version,
             created_at, updated_at)
           VALUES (?, ?, 'pending', 1, ?, ?, ?, ?, 100, 'usd', ?, ?, ?, ?, ?)`,
        )
        .bind(
          command.id,
          command.reservationId,
          command.providerCheckoutId,
          command.idempotencyKey,
          command.redirectUrl,
          command.expiresAt,
          command.ownerSessionId,
          command.correlationId,
          command.expectedReservationVersion,
          now,
          now,
        )
        .run();
    } catch (error) {
      const replay = await this.findCheckoutLaunch(
        command.ownerSessionId,
        command.reservationId,
        command.idempotencyKey,
      );
      if (replay) return replay;
      throw error;
    }

    const created = await this.findCheckoutLaunch(
      command.ownerSessionId,
      command.reservationId,
      command.idempotencyKey,
    );
    if (!created) throw new Error("Checkout persistence did not complete.");
    return created;
  }

  async processPaymentEvent(
    event: PaymentWebhookEvent,
    correlationId: string,
  ): Promise<"applied" | "replayed" | "rejected"> {
    if (event.type === "ignored") return "rejected";
    const existing = await this.database
      .prepare(`SELECT outcome FROM payment_events WHERE provider_event_id = ?`)
      .bind(event.id)
      .first<{ outcome: "applied" | "rejected" }>();
    if (existing) return "replayed";

    const checkout = await this.database
      .prepare(`SELECT id FROM checkouts WHERE id = ?`)
      .bind(event.checkoutId)
      .first<{ id: string }>();
    if (!checkout) throw new Error("Referenced checkout does not exist.");

    const now = this.clock().toISOString();
    const providerCheckoutId =
      "providerCheckoutId" in event ? event.providerCheckoutId : null;
    const providerPaymentId =
      "providerPaymentId" in event ? event.providerPaymentId : null;
    const providerRefundId =
      "providerRefundId" in event ? event.providerRefundId : null;
    try {
      await this.database
        .prepare(
          `INSERT INTO payment_events
            (id, checkout_id, provider_event_id, event_type, received_at,
             processed_at, outcome, checkout_reference_id,
             provider_checkout_id, provider_payment_id, provider_refund_id,
             provider_occurred_at, correlation_id)
           VALUES (?, ?, ?, ?, ?, NULL, 'received', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          event.checkoutId,
          event.id,
          event.type,
          now,
          event.checkoutId,
          providerCheckoutId,
          providerPaymentId,
          providerRefundId,
          event.occurredAt,
          correlationId,
        )
        .run();
    } catch (error) {
      const replay = await this.database
        .prepare(
          `SELECT outcome FROM payment_events WHERE provider_event_id = ?`,
        )
        .bind(event.id)
        .first();
      if (replay) return "replayed";
      throw error;
    }
    const applied = await this.database
      .prepare(`SELECT outcome FROM payment_events WHERE provider_event_id = ?`)
      .bind(event.id)
      .first<{ outcome: "applied" | "rejected" }>();
    return applied?.outcome ?? "rejected";
  }

  async findCancellationCandidate(
    ownerSessionId: string,
    reservationId: string,
  ): Promise<CancellationCandidate | null> {
    const row = await this.database
      .prepare(
        `SELECT r.id AS reservation_id, r.version AS reservation_version,
                c.id AS checkout_id, c.provider_payment_id
         FROM reservations r
         JOIN checkouts c ON c.reservation_id = r.id
         WHERE r.id = ? AND r.owner_session_id = ? AND r.state = 'confirmed'
           AND c.state = 'succeeded' AND c.refund_state = 'not_requested'
           AND c.provider_payment_id IS NOT NULL
         ORDER BY c.completed_at DESC LIMIT 1`,
      )
      .bind(reservationId, ownerSessionId)
      .first<{
        reservation_id: string;
        reservation_version: number;
        checkout_id: string;
        provider_payment_id: string;
      }>();
    return row
      ? {
          reservationId: row.reservation_id,
          reservationVersion: row.reservation_version,
          checkoutId: row.checkout_id,
          providerPaymentId: row.provider_payment_id,
        }
      : null;
  }

  async findCancellation(
    ownerSessionId: string,
    reservationId: string,
    idempotencyKey: string,
  ): Promise<CancellationResult | null> {
    const row = await this.database
      .prepare(
        `SELECT reservation_id, checkout_id, provider_refund_id
         FROM cancellation_requests
         WHERE owner_session_id = ? AND reservation_id = ? AND idempotency_key = ?`,
      )
      .bind(ownerSessionId, reservationId, idempotencyKey)
      .first<{
        reservation_id: string;
        checkout_id: string;
        provider_refund_id: string;
      }>();
    return row
      ? {
          reservationId: row.reservation_id,
          checkoutId: row.checkout_id,
          reservationState: "cancellation_pending",
          refundState: "pending",
          providerRefundId: row.provider_refund_id,
        }
      : null;
  }

  async startCancellation(
    command: StartCancellation,
  ): Promise<CancellationResult> {
    const existing = await this.findCancellation(
      command.ownerSessionId,
      command.reservationId,
      command.idempotencyKey,
    );
    if (existing) return existing;
    const now = this.clock().toISOString();
    const requestId = crypto.randomUUID();
    try {
      await this.database
        .prepare(
          `INSERT INTO cancellation_requests
            (id, reservation_id, checkout_id, owner_session_id,
             expected_reservation_version, idempotency_key, provider_refund_id,
             correlation_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          requestId,
          command.reservationId,
          command.checkoutId,
          command.ownerSessionId,
          command.reservationVersion,
          command.idempotencyKey,
          command.providerRefundId,
          command.correlationId,
          now,
        )
        .run();
    } catch (error) {
      const replay = await this.findCancellation(
        command.ownerSessionId,
        command.reservationId,
        command.idempotencyKey,
      );
      if (replay) return replay;
      throw error;
    }
    return {
      reservationId: command.reservationId,
      checkoutId: command.checkoutId,
      reservationState: "cancellation_pending",
      refundState: "pending",
      providerRefundId: command.providerRefundId,
    };
  }
}
