ALTER TABLE payment_events ADD COLUMN checkout_reference_id TEXT REFERENCES checkouts(id);
ALTER TABLE payment_events ADD COLUMN provider_checkout_id TEXT;
ALTER TABLE payment_events ADD COLUMN provider_payment_id TEXT;
ALTER TABLE payment_events ADD COLUMN provider_refund_id TEXT;
ALTER TABLE payment_events ADD COLUMN provider_occurred_at TEXT;
ALTER TABLE payment_events ADD COLUMN correlation_id TEXT;

CREATE INDEX payment_events_checkout_idx
  ON payment_events (checkout_reference_id, received_at);

CREATE TABLE cancellation_requests (
  id TEXT PRIMARY KEY NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  checkout_id TEXT NOT NULL REFERENCES checkouts(id),
  owner_session_id TEXT NOT NULL REFERENCES sessions(id),
  expected_reservation_version INTEGER NOT NULL CHECK (expected_reservation_version >= 0),
  idempotency_key TEXT NOT NULL,
  provider_refund_id TEXT NOT NULL UNIQUE,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (reservation_id, idempotency_key)
);

CREATE TRIGGER cancellation_requests_require_confirmed_owner
BEFORE INSERT ON cancellation_requests
WHEN NOT EXISTS (
  SELECT 1
  FROM reservations r
  JOIN checkouts c ON c.id = NEW.checkout_id AND c.reservation_id = r.id
  WHERE r.id = NEW.reservation_id
    AND r.owner_session_id = NEW.owner_session_id
    AND r.state = 'confirmed'
    AND r.version = NEW.expected_reservation_version
    AND c.state = 'succeeded'
    AND c.refund_state = 'not_requested'
    AND c.provider_payment_id IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'reservation is not cancellable');
END;

CREATE TRIGGER cancellation_requests_advance_reservation
AFTER INSERT ON cancellation_requests
BEGIN
  UPDATE checkouts
  SET refund_state = 'pending', provider_refund_id = NEW.provider_refund_id,
      version = version + 1, updated_at = NEW.created_at
  WHERE id = NEW.checkout_id AND refund_state = 'not_requested';

  UPDATE reservations
  SET state = 'cancellation_pending', version = version + 1,
      updated_at = NEW.created_at
  WHERE id = NEW.reservation_id AND state = 'confirmed'
    AND version = NEW.expected_reservation_version;

  INSERT INTO reservation_transitions
    (id, reservation_id, operation_id, previous_state, new_state, version,
     actor_session_id, cause, correlation_id, occurred_at)
  VALUES
    ('transition:' || NEW.id, NEW.reservation_id, 'cancel:' || NEW.id,
     'confirmed', 'cancellation_pending',
     (SELECT version FROM reservations WHERE id = NEW.reservation_id),
     NEW.owner_session_id, 'sandbox_cancellation_confirmed',
     NEW.correlation_id, NEW.created_at);

  INSERT INTO audit_events
    (id, occurred_at, actor_id, action, subject_type, subject_id,
     correlation_id, details_json)
  VALUES
    ('audit:' || NEW.id, NEW.created_at, NEW.owner_session_id,
     'refund.started', 'checkout', NEW.checkout_id, NEW.correlation_id,
     json_object('reservationId', NEW.reservation_id, 'mode', 'sandbox'));
END;

CREATE TRIGGER payment_events_apply
AFTER INSERT ON payment_events
BEGIN
  UPDATE checkouts
  SET state = CASE
        WHEN NEW.event_type = 'checkout.succeeded' THEN 'succeeded'
        WHEN NEW.event_type = 'checkout.failed' THEN 'failed'
        WHEN NEW.event_type = 'checkout.expired' THEN 'expired'
        ELSE state
      END,
      refund_state = CASE
        WHEN NEW.event_type = 'refund.pending' THEN 'pending'
        WHEN NEW.event_type = 'refund.succeeded' THEN 'succeeded'
        WHEN NEW.event_type = 'refund.failed' THEN 'failed'
        ELSE refund_state
      END,
      provider_checkout_id = COALESCE(NEW.provider_checkout_id, provider_checkout_id),
      provider_payment_id = COALESCE(NEW.provider_payment_id, provider_payment_id),
      provider_refund_id = COALESCE(NEW.provider_refund_id, provider_refund_id),
      completed_at = CASE
        WHEN NEW.event_type = 'checkout.succeeded' THEN NEW.provider_occurred_at
        ELSE completed_at
      END,
      version = version + 1,
      updated_at = NEW.received_at
  WHERE id = NEW.checkout_reference_id
    AND (
      (NEW.event_type IN ('checkout.succeeded', 'checkout.failed', 'checkout.expired')
        AND state = 'pending')
      OR (NEW.event_type IN ('refund.pending', 'refund.succeeded', 'refund.failed')
        AND refund_state = 'pending')
    );

  UPDATE payment_events
  SET outcome = CASE WHEN changes() = 1 THEN 'applied' ELSE 'rejected' END
  WHERE id = NEW.id;

  UPDATE reservations
  SET state = CASE
        WHEN NEW.event_type = 'checkout.succeeded' THEN 'confirmed'
        WHEN NEW.event_type IN ('checkout.failed', 'checkout.expired') THEN 'draft'
        WHEN NEW.event_type = 'refund.succeeded' THEN 'cancelled'
        WHEN NEW.event_type = 'refund.failed' THEN 'confirmed'
        ELSE state
      END,
      version = version + 1,
      updated_at = NEW.received_at
  WHERE id = (
      SELECT reservation_id FROM checkouts WHERE id = NEW.checkout_reference_id
    )
    AND (SELECT outcome FROM payment_events WHERE id = NEW.id) = 'applied'
    AND (
      (NEW.event_type = 'checkout.succeeded' AND state = 'payment_pending')
      OR (NEW.event_type IN ('checkout.failed', 'checkout.expired') AND state = 'payment_pending')
      OR (NEW.event_type = 'refund.succeeded' AND state = 'cancellation_pending')
      OR (NEW.event_type = 'refund.failed' AND state = 'cancellation_pending')
    );

  INSERT INTO reservation_transitions
    (id, reservation_id, operation_id, previous_state, new_state, version,
     actor_session_id, cause, correlation_id, occurred_at)
  SELECT
    'transition:' || NEW.id, c.reservation_id, 'stripe:' || NEW.provider_event_id,
    CASE
      WHEN NEW.event_type IN ('checkout.succeeded', 'checkout.failed', 'checkout.expired')
        THEN 'payment_pending'
      ELSE 'cancellation_pending'
    END,
    CASE
      WHEN NEW.event_type = 'checkout.succeeded' THEN 'confirmed'
      WHEN NEW.event_type IN ('checkout.failed', 'checkout.expired') THEN 'draft'
      WHEN NEW.event_type = 'refund.succeeded' THEN 'cancelled'
      ELSE 'confirmed'
    END,
    r.version, NULL, NEW.event_type, NEW.correlation_id, NEW.received_at
  FROM checkouts c
  JOIN reservations r ON r.id = c.reservation_id
  WHERE c.id = NEW.checkout_reference_id
    AND (SELECT outcome FROM payment_events WHERE id = NEW.id) = 'applied'
    AND NEW.event_type IN (
      'checkout.succeeded', 'checkout.failed', 'checkout.expired',
      'refund.succeeded', 'refund.failed'
    );

  INSERT INTO audit_events
    (id, occurred_at, actor_id, action, subject_type, subject_id,
     correlation_id, details_json)
  SELECT
    'audit:' || NEW.id, NEW.received_at, NULL, 'stripe.' || NEW.event_type,
    'checkout', NEW.checkout_reference_id, NEW.correlation_id,
    json_object('providerEventId', NEW.provider_event_id,
                'outcome', (SELECT outcome FROM payment_events WHERE id = NEW.id))
  WHERE NEW.checkout_reference_id IS NOT NULL;

  UPDATE payment_events SET processed_at = NEW.received_at WHERE id = NEW.id;
END;
