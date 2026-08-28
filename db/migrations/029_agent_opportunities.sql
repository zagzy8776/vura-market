BEGIN;

CREATE TABLE IF NOT EXISTS agent_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  signal text NOT NULL,
  score integer CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  source text,
  evidence text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'watching', 'investigating', 'approved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_opportunities_status_score
  ON agent_opportunities (status, score DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_opportunities_category_created
  ON agent_opportunities (category, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_opportunities_active_name_category
  ON agent_opportunities (agent_id, lower(name), lower(category))
  WHERE status NOT IN ('dismissed');

COMMIT;
