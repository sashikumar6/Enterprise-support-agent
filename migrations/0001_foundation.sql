CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  details_json TEXT NOT NULL CHECK (json_valid(details_json))
);

CREATE INDEX audit_events_correlation_id_idx
  ON audit_events (correlation_id);

CREATE INDEX audit_events_subject_idx
  ON audit_events (subject_type, subject_id, occurred_at);

CREATE TABLE provider_health_events (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unavailable')),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  failure_category TEXT,
  correlation_id TEXT NOT NULL
);

CREATE INDEX provider_health_provider_observed_idx
  ON provider_health_events (provider, observed_at);
