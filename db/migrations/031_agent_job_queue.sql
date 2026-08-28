-- Phase N: agent job queue fields (additive, idempotent)
-- Extends agent_runs for async Fly worker processing.

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_status_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'awaiting_approval'));

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS input jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS lock_token text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS next_run_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS result jsonb;

CREATE INDEX IF NOT EXISTS idx_agent_runs_queue_claim
  ON agent_runs (status, next_run_at)
  WHERE status = 'queued';
