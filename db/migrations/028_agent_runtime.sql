CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY,
  agent_id text NOT NULL,
  task text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','failed','awaiting_approval')),
  provider text,
  model text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_started ON agent_runs(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status_started ON agent_runs(status, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_events (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  tool_name text,
  risk text,
  input jsonb,
  output jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_run_created ON agent_events(run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_approvals (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  tool_name text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('write','destructive')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decision_note text
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_status_requested ON agent_approvals(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS agent_provider_usage (
  provider text NOT NULL,
  usage_day date NOT NULL DEFAULT CURRENT_DATE,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  last_used_at timestamptz,
  PRIMARY KEY (provider, usage_day)
);
