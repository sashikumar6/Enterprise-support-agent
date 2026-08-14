CREATE TABLE tool_invocations (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  provider TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'degraded', 'failed')),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  correlation_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json))
);

CREATE INDEX tool_invocations_correlation_idx
  ON tool_invocations (correlation_id, occurred_at);

CREATE INDEX provider_health_correlation_idx
  ON provider_health_events (correlation_id, observed_at);
