import type {
  EventStatusChange,
  HelpRequest,
  InAppAlert,
  LifecycleRepository,
  PreferenceProfile,
} from "@scout/core";

const emptyPreferences: PreferenceProfile = {
  categories: [],
  budgetMax: null,
  timePreference: "any",
  favoriteArtists: [],
  favoriteVenues: [],
  updatedAt: null,
};

export class D1LifecycleRepository implements LifecycleRepository {
  constructor(
    private readonly database: D1Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getPreferences(ownerSessionId: string) {
    const row = await this.database
      .prepare(
        `SELECT categories_json, budget_max, time_preference, favorite_artists_json, favorite_venues_json, updated_at FROM preference_profiles WHERE owner_session_id = ?`,
      )
      .bind(ownerSessionId)
      .first<{
        categories_json: string;
        budget_max: number | null;
        time_preference: PreferenceProfile["timePreference"];
        favorite_artists_json: string;
        favorite_venues_json: string;
        updated_at: string;
      }>();
    return row
      ? {
          categories: JSON.parse(row.categories_json),
          budgetMax: row.budget_max,
          timePreference: row.time_preference,
          favoriteArtists: JSON.parse(row.favorite_artists_json),
          favoriteVenues: JSON.parse(row.favorite_venues_json),
          updatedAt: row.updated_at,
        }
      : emptyPreferences;
  }

  async savePreferences(
    ownerSessionId: string,
    profile: PreferenceProfile,
    correlationId: string,
  ) {
    const now = this.clock().toISOString();
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO preference_profiles (owner_session_id, categories_json, budget_max, time_preference, favorite_artists_json, favorite_venues_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_session_id) DO UPDATE SET categories_json = excluded.categories_json, budget_max = excluded.budget_max, time_preference = excluded.time_preference, favorite_artists_json = excluded.favorite_artists_json, favorite_venues_json = excluded.favorite_venues_json, updated_at = excluded.updated_at`,
        )
        .bind(
          ownerSessionId,
          JSON.stringify(profile.categories),
          profile.budgetMax,
          profile.timePreference,
          JSON.stringify(profile.favoriteArtists),
          JSON.stringify(profile.favoriteVenues),
          now,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_events (id, occurred_at, actor_id, action, subject_type, subject_id, correlation_id, details_json) VALUES (?, ?, ?, 'preferences.updated', 'session', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          now,
          ownerSessionId,
          ownerSessionId,
          correlationId,
          JSON.stringify({
            fields: [
              "categories",
              "budgetMax",
              "timePreference",
              "favoriteArtists",
              "favoriteVenues",
            ],
          }),
        ),
    ]);
    return { ...profile, updatedAt: now };
  }

  async ownedProviderEvents(ownerSessionId: string) {
    const result = await this.database
      .prepare(
        `SELECT r.id AS reservation_id, e.provider, e.provider_event_id,
                COALESCE((SELECT latest.current_status FROM event_status_checks latest
                          WHERE latest.reservation_id = r.id
                          ORDER BY latest.observed_at DESC, latest.id DESC LIMIT 1),
                         json_extract(e.snapshot_json, '$.status')) AS status
         FROM reservations r
         JOIN event_snapshots e ON e.id = r.event_snapshot_id
         WHERE r.owner_session_id = ?`,
      )
      .bind(ownerSessionId)
      .all<{
        reservation_id: string;
        provider: "ticketmaster" | "fixture";
        provider_event_id: string;
        status: string | null;
      }>();
    return result.results.map((row) => ({
      reservationId: row.reservation_id,
      provider: row.provider,
      providerEventId: row.provider_event_id,
      status: row.status,
    }));
  }

  async recordStatus(
    ownerSessionId: string,
    input: EventStatusChange,
    correlationId: string,
  ) {
    const now = this.clock().toISOString();
    const statements = [
      this.database
        .prepare(
          `INSERT INTO event_status_checks (id, reservation_id, previous_status, current_status, changed, correlation_id, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.reservationId,
          input.previousStatus,
          input.currentStatus,
          input.changed ? 1 : 0,
          correlationId,
          now,
        ),
    ];
    if (input.changed) {
      statements.push(
        this.database
          .prepare(
            `INSERT OR IGNORE INTO in_app_alerts (id, owner_session_id, reservation_id, kind, message, status_value, created_at, read_at) VALUES (?, ?, ?, 'event_status_changed', ?, ?, ?, NULL)`,
          )
          .bind(
            crypto.randomUUID(),
            ownerSessionId,
            input.reservationId,
            `Provider status changed from ${input.previousStatus ?? "unknown"} to ${input.currentStatus ?? "unknown"}. Check the provider page before making plans.`,
            input.currentStatus,
            now,
          ),
      );
    }
    await this.database.batch(statements);
  }

  async listAlerts(ownerSessionId: string) {
    const rows = await this.database
      .prepare(
        `SELECT id, reservation_id, kind, message, created_at, read_at FROM in_app_alerts WHERE owner_session_id = ? ORDER BY created_at DESC`,
      )
      .bind(ownerSessionId)
      .all<{
        id: string;
        reservation_id: string;
        kind: InAppAlert["kind"];
        message: string;
        created_at: string;
        read_at: string | null;
      }>();
    return rows.results.map((row) => ({
      id: row.id,
      reservationId: row.reservation_id,
      kind: row.kind,
      message: row.message,
      createdAt: row.created_at,
      readAt: row.read_at,
    }));
  }

  async dismissAlert(ownerSessionId: string, alertId: string) {
    const result = await this.database
      .prepare(
        `UPDATE in_app_alerts SET read_at = ? WHERE id = ? AND owner_session_id = ? AND read_at IS NULL`,
      )
      .bind(this.clock().toISOString(), alertId, ownerSessionId)
      .run();
    return result.meta.changes === 1;
  }

  async createHelpRequest(
    ownerSessionId: string,
    reservationId: string | null,
    message: string,
    correlationId: string,
  ) {
    if (reservationId) {
      const owned = await this.database
        .prepare(
          `SELECT id FROM reservations WHERE id = ? AND owner_session_id = ?`,
        )
        .bind(reservationId, ownerSessionId)
        .first();
      if (!owned) throw new Error("reservation not owned");
    }
    const request: HelpRequest = {
      id: crypto.randomUUID(),
      reservationId,
      message,
      status: "open",
      createdAt: this.clock().toISOString(),
    };
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO help_requests (id, owner_session_id, reservation_id, message, status, correlation_id, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?)`,
        )
        .bind(
          request.id,
          ownerSessionId,
          reservationId,
          message,
          correlationId,
          request.createdAt,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_events (id, occurred_at, actor_id, action, subject_type, subject_id, correlation_id, details_json) VALUES (?, ?, ?, 'help.requested', 'help_request', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          request.createdAt,
          ownerSessionId,
          request.id,
          correlationId,
          JSON.stringify({ reservationId, staffedService: false }),
        ),
    ]);
    return request;
  }

  async listHelpRequests(ownerSessionId: string) {
    const rows = await this.database
      .prepare(
        `SELECT id, reservation_id, message, status, created_at FROM help_requests WHERE owner_session_id = ? ORDER BY created_at DESC`,
      )
      .bind(ownerSessionId)
      .all<{
        id: string;
        reservation_id: string | null;
        message: string;
        status: "open";
        created_at: string;
      }>();
    return rows.results.map((row) => ({
      id: row.id,
      reservationId: row.reservation_id,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
    }));
  }
}
