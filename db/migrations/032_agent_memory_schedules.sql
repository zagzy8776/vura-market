-- Phase M/N hardening: bounded memory + schedule registry (additive)

CREATE TABLE IF NOT EXISTS agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('observation','source','decision','outcome','signal','failure')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  importance smallint NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  correlation_id text,
  opportunity_id uuid,
  run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_created ON agent_memory(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_kind_created ON agent_memory(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_correlation ON agent_memory(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_schedules (
  id text PRIMARY KEY,
  agent_id text NOT NULL,
  task text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  cron_hint text,
  interval_minutes integer NOT NULL CHECK (interval_minutes >= 5),
  enabled boolean NOT NULL DEFAULT true,
  last_enqueued_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO agent_schedules (id, agent_id, task, interval_minutes, input)
VALUES
  ('daily-trend-scan', 'trend-intelligence', 'scheduled trend scan', 1440, '{"categories":["phones","laptops","solar","fashion"]}'::jsonb),
  ('sales-inventory-scan', 'sales', 'scheduled sales scan', 360, '{}'::jsonb),
  ('operations-scan', 'operations', 'scheduled operations scan', 180, '{}'::jsonb),
  ('engineering-health', 'engineering', 'scheduled engineering health', 360, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
