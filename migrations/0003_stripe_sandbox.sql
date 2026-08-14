ALTER TABLE checkouts ADD COLUMN idempotency_key TEXT;
ALTER TABLE checkouts ADD COLUMN provider_url TEXT;
ALTER TABLE checkouts ADD COLUMN expires_at TEXT;
ALTER TABLE checkouts ADD COLUMN amount_minor INTEGER NOT NULL DEFAULT 100 CHECK (amount_minor > 0);
ALTER TABLE checkouts ADD COLUMN currency TEXT NOT NULL DEFAULT 'usd' CHECK (length(currency) = 3);
ALTER TABLE checkouts ADD COLUMN provider_payment_id TEXT;
ALTER TABLE checkouts ADD COLUMN completed_at TEXT;
ALTER TABLE checkouts ADD COLUMN refund_state TEXT NOT NULL DEFAULT 'not_requested'
  CHECK (refund_state IN ('not_requested', 'pending', 'succeeded', 'failed'));
ALTER TABLE checkouts ADD COLUMN provider_refund_id TEXT;
ALTER TABLE checkouts ADD COLUMN initiated_by_session_id TEXT REFERENCES sessions(id);
ALTER TABLE checkouts ADD COLUMN correlation_id TEXT;
ALTER TABLE checkouts ADD COLUMN expected_reservation_version INTEGER CHECK (expected_reservation_version >= 0);

CREATE UNIQUE INDEX checkouts_reservation_idempotency_idx
  ON checkouts (reservation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX checkouts_provider_payment_idx ON checkouts (provider_payment_id);

CREATE TRIGGER checkouts_require_owned_draft
BEFORE INSERT ON checkouts
WHEN NOT EXISTS (
  SELECT 1
  FROM reservations
  WHERE id = NEW.reservation_id
    AND owner_session_id = NEW.initiated_by_session_id
    AND state = 'draft'
    AND version = NEW.expected_reservation_version
)
BEGIN
  SELECT RAISE(ABORT, 'reservation is not an owned draft');
END;

CREATE TRIGGER checkouts_advance_reservation
AFTER INSERT ON checkouts
BEGIN
  UPDATE reservations
  SET state = 'payment_pending', version = version + 1, updated_at = NEW.created_at
  WHERE id = NEW.reservation_id
    AND owner_session_id = NEW.initiated_by_session_id
    AND state = 'draft'
    AND version = NEW.expected_reservation_version;

  INSERT INTO reservation_transitions
    (id, reservation_id, operation_id, previous_state, new_state, version,
     actor_session_id, cause, correlation_id, occurred_at)
  VALUES
    ('transition:' || NEW.id, NEW.reservation_id, 'checkout:' || NEW.id,
     'draft', 'payment_pending',
     (SELECT version FROM reservations WHERE id = NEW.reservation_id),
     NEW.initiated_by_session_id, 'sandbox_checkout_confirmed',
     NEW.correlation_id, NEW.created_at);

  INSERT INTO audit_events
    (id, occurred_at, actor_id, action, subject_type, subject_id, correlation_id, details_json)
  VALUES
    ('audit:' || NEW.id, NEW.created_at, NEW.initiated_by_session_id,
     'checkout.started', 'checkout', NEW.id, NEW.correlation_id,
     json_object('reservationId', NEW.reservation_id, 'mode', 'sandbox'));
END;
