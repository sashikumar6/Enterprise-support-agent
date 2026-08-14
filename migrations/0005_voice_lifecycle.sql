CREATE TABLE preference_profiles (
  owner_session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  categories_json TEXT NOT NULL CHECK (json_valid(categories_json)),
  budget_max REAL,
  time_preference TEXT NOT NULL CHECK (time_preference IN ('any', 'daytime', 'evening')),
  favorite_artists_json TEXT NOT NULL CHECK (json_valid(favorite_artists_json)),
  favorite_venues_json TEXT NOT NULL CHECK (json_valid(favorite_venues_json)),
  updated_at TEXT NOT NULL
);

CREATE TABLE event_status_checks (
  id TEXT PRIMARY KEY NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  previous_status TEXT,
  current_status TEXT,
  changed INTEGER NOT NULL CHECK (changed IN (0, 1)),
  correlation_id TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE INDEX event_status_checks_reservation_idx
  ON event_status_checks (reservation_id, observed_at DESC);

CREATE TABLE in_app_alerts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind = 'event_status_changed'),
  message TEXT NOT NULL,
  status_value TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (reservation_id, kind, status_value)
);

CREATE INDEX in_app_alerts_owner_idx
  ON in_app_alerts (owner_session_id, read_at, created_at DESC);

CREATE TABLE help_requests (
  id TEXT PRIMARY KEY NOT NULL,
  owner_session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 5 AND 500),
  status TEXT NOT NULL CHECK (status = 'open'),
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX help_requests_owner_idx
  ON help_requests (owner_session_id, created_at DESC);
