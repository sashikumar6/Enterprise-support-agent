CREATE TABLE rate_limit_windows (
  scope TEXT NOT NULL,
  actor_hash TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  expires_at TEXT NOT NULL,
  PRIMARY KEY (scope, actor_hash, window_started_at)
);

CREATE INDEX rate_limit_windows_expiry_idx
  ON rate_limit_windows (expires_at);
