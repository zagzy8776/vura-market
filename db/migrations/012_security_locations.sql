BEGIN;

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, subject_hash, window_started_at)
);
CREATE INDEX IF NOT EXISTS api_rate_limits_cleanup_idx ON api_rate_limits(window_started_at);

CREATE TABLE IF NOT EXISTS nigeria_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nigeria_lgas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id uuid NOT NULL REFERENCES nigeria_states(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(state_id, name)
);
CREATE INDEX IF NOT EXISTS nigeria_lgas_state_idx ON nigeria_lgas(state_id);

CREATE OR REPLACE FUNCTION consume_api_rate_limit(
  p_bucket text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  started timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  count_now integer;
BEGIN
  INSERT INTO api_rate_limits(bucket,subject_hash,window_started_at,request_count)
  VALUES(p_bucket,p_subject_hash,started,1)
  ON CONFLICT(bucket,subject_hash,window_started_at)
  DO UPDATE SET request_count=api_rate_limits.request_count+1
  RETURNING request_count INTO count_now;
  RETURN count_now <= p_limit;
END;
$$;

COMMIT;
