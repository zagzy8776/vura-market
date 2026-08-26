BEGIN;

-- Email delivery retries: persist message content so a worker can re-send,
-- track attempts with exponential backoff, and dead-letter after exhaustion.

ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS body_text text;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS body_html text;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz;

-- Allow terminal dead-letter state alongside queued/sent/failed.
ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_status_check;
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'dead_letter'));

CREATE INDEX IF NOT EXISTS email_deliveries_retry_idx
  ON email_deliveries(status, next_attempt_at)
  WHERE status = 'failed';

COMMIT;
