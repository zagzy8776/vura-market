-- Phase: Missions + DAG steps for agent orchestration
-- Additive. Does not replace agent_runs / job queue.

CREATE TABLE IF NOT EXISTS agent_missions (
  id uuid PRIMARY KEY,
  goal text NOT NULL,
  mission_type text NOT NULL DEFAULT 'growth'
    CHECK (mission_type IN ('growth', 'system_health')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled'
    )),
  policy_level integer NOT NULL DEFAULT 2 CHECK (policy_level BETWEEN 0 AND 4),
  correlation_id text NOT NULL,
  opportunity_id uuid,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_missions_correlation
  ON agent_missions (correlation_id);
CREATE INDEX IF NOT EXISTS idx_agent_missions_status_created
  ON agent_missions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_mission_steps (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES agent_missions(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  agent_id text,
  depends_on text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'ready', 'queued', 'running', 'completed',
      'failed', 'awaiting_approval', 'skipped'
    )),
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  error text,
  sort_order integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (mission_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_mission_steps_mission
  ON agent_mission_steps (mission_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_agent_mission_steps_status
  ON agent_mission_steps (status)
  WHERE status IN ('pending', 'ready', 'queued', 'running');
