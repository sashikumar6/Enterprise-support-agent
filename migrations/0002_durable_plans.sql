CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE event_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('ticketmaster', 'fixture')),
  provider_event_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX event_snapshots_provider_event_idx
  ON event_snapshots (provider, provider_event_id);

CREATE TRIGGER event_snapshots_prevent_update
BEFORE UPDATE ON event_snapshots
BEGIN
  SELECT RAISE(ABORT, 'event snapshots are immutable');
END;

CREATE TABLE reservations (
  id TEXT PRIMARY KEY NOT NULL,
  owner_session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_snapshot_id TEXT NOT NULL REFERENCES event_snapshots(id),
  state TEXT NOT NULL CHECK (
    state IN ('draft', 'payment_pending', 'confirmed', 'cancellation_pending', 'cancelled')
  ),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_session_id, idempotency_key)
);

CREATE INDEX reservations_owner_updated_idx
  ON reservations (owner_session_id, updated_at DESC);

CREATE TABLE checkouts (
  id TEXT PRIMARY KEY NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  state TEXT NOT NULL CHECK (state IN ('created', 'pending', 'succeeded', 'failed', 'expired')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  provider_checkout_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX checkouts_reservation_id_idx ON checkouts (reservation_id);

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY NOT NULL,
  checkout_id TEXT NOT NULL REFERENCES checkouts(id),
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('received', 'applied', 'replayed', 'rejected'))
);

CREATE TABLE reservation_transitions (
  id TEXT PRIMARY KEY NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  operation_id TEXT NOT NULL UNIQUE,
  previous_state TEXT,
  new_state TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 0),
  actor_session_id TEXT REFERENCES sessions(id),
  cause TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX reservation_transitions_reservation_idx
  ON reservation_transitions (reservation_id, version);
