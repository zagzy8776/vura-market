BEGIN;

-- Make notification creation idempotent at the database layer. The same event
-- can be retried by a worker without creating duplicate customer notifications.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_idempotency_uidx
  ON notifications(user_id, order_id, type)
  WHERE order_id IS NOT NULL;

-- Prevent duplicate email delivery records for the same order event/recipient.
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_event_uidx
  ON email_deliveries(order_id, event_type, recipient)
  WHERE order_id IS NOT NULL;

-- Tracking history must not contain the same logical event twice.
CREATE UNIQUE INDEX IF NOT EXISTS order_tracking_events_dedupe_uidx
  ON order_tracking_events(order_id, status, COALESCE(tracking_number, ''), COALESCE(location, ''), message);

COMMIT;
