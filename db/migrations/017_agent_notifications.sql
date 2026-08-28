BEGIN;

CREATE TABLE IF NOT EXISTS agent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
  agent_id text,
  opportunity_id uuid REFERENCES agent_opportunities(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_created
  ON agent_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_agent
  ON agent_notifications (agent_id, created_at DESC);

COMMIT;
