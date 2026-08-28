/**
 * Agent job queue — Neon-backed, claimed by Fly worker.
 * Vercel enqueues; Fly executes long-running agent work.
 */
import { randomUUID } from 'crypto';
import { sql } from '../db.js';
import type { AgentId } from './types.js';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'awaiting_approval';

export interface EnqueueInput {
  agentId: AgentId;
  task: string;
  input?: Record<string, unknown>;
  maxAttempts?: number;
  /** Idempotency key stored in metadata — duplicate enqueue returns existing run */
  idempotencyKey?: string;
}

export async function enqueueAgentJob(input: EnqueueInput) {
  if (input.idempotencyKey) {
    const existing = await sql`
      SELECT id, agent_id, task, status, created_at, attempts
      FROM (
        SELECT id, agent_id, task, status, started_at AS created_at, attempts, metadata
        FROM agent_runs
        WHERE agent_id = ${input.agentId}
          AND metadata->>'idempotencyKey' = ${input.idempotencyKey}
          AND status IN ('queued', 'running')
        ORDER BY started_at DESC
        LIMIT 1
      ) t`;
    if (existing[0]) {
      return { runId: String(existing[0].id), status: String(existing[0].status) as JobStatus, deduped: true };
    }
  }

  const id = randomUUID();
  const metadata = {
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    enqueuedAt: new Date().toISOString(),
  };
  await sql`
    INSERT INTO agent_runs (id, agent_id, task, status, input, metadata, max_attempts, next_run_at, attempts)
    VALUES (
      ${id},
      ${input.agentId},
      ${input.task.slice(0, 4000)},
      'queued',
      ${JSON.stringify(input.input ?? {})}::jsonb,
      ${JSON.stringify(metadata)}::jsonb,
      ${input.maxAttempts ?? 3},
      now(),
      0
    )`;
  return { runId: id, status: 'queued' as const, deduped: false };
}

/** Claim next queued job (single-worker safe via lock_token). */
export async function claimNextJob(workerId: string) {
  const token = `${workerId}:${randomUUID()}`;
  // Select candidate then lock — Neon serverless may not support SKIP LOCKED in all paths
  const candidates = await sql`
    SELECT id FROM agent_runs
    WHERE status = 'queued' AND next_run_at <= now()
    ORDER BY next_run_at ASC
    LIMIT 1`;
  if (!candidates[0]) return null;

  const id = String(candidates[0].id);
  const rows = await sql`
    UPDATE agent_runs
    SET status = 'running',
        locked_at = now(),
        lock_token = ${token},
        attempts = attempts + 1,
        started_at = COALESCE(started_at, now())
    WHERE id = ${id}::uuid AND status = 'queued'
    RETURNING id, agent_id, task, input, attempts, max_attempts, metadata`;
  if (!rows[0]) return null;
  return {
    runId: String(rows[0].id),
    agentId: String(rows[0].agent_id) as AgentId,
    task: String(rows[0].task),
    input: (rows[0].input || {}) as Record<string, unknown>,
    attempts: Number(rows[0].attempts || 1),
    maxAttempts: Number(rows[0].max_attempts || 3),
    lockToken: token,
  };
}

export async function completeJob(runId: string, lockToken: string, result: unknown, provider?: string, model?: string) {
  await sql`
    UPDATE agent_runs
    SET status = 'completed',
        completed_at = now(),
        result = ${JSON.stringify(result ?? {})}::jsonb,
        provider = ${provider ?? null},
        model = ${model ?? null},
        lock_token = null,
        locked_at = null,
        error = null
    WHERE id = ${runId}::uuid AND (lock_token = ${lockToken} OR lock_token IS NULL)`;
}

export async function failJob(runId: string, lockToken: string, error: string, attempts: number, maxAttempts: number) {
  const canRetry = attempts < maxAttempts;
  if (canRetry) {
    // exponential backoff: 30s * 2^(attempts-1)
    const delaySec = Math.min(900, 30 * Math.pow(2, Math.max(0, attempts - 1)));
    await sql`
      UPDATE agent_runs
      SET status = 'queued',
          error = ${error.slice(0, 2000)},
          next_run_at = now() + make_interval(secs => ${delaySec}),
          lock_token = null,
          locked_at = null
      WHERE id = ${runId}::uuid AND (lock_token = ${lockToken} OR lock_token IS NULL)`;
    return { retried: true, delaySec };
  }
  await sql`
    UPDATE agent_runs
    SET status = 'failed',
        completed_at = now(),
        error = ${error.slice(0, 2000)},
        lock_token = null,
        locked_at = null,
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ deadLetter: true, failedAt: new Date().toISOString() })}::jsonb
    WHERE id = ${runId}::uuid AND (lock_token = ${lockToken} OR lock_token IS NULL)`;
  return { retried: false, deadLetter: true };
}

/** Recover stuck running jobs (worker crash). */
export async function recoverStaleLocks(staleMinutes = 15) {
  const rows = await sql`
    UPDATE agent_runs
    SET status = 'queued',
        lock_token = null,
        locked_at = null,
        next_run_at = now(),
        error = COALESCE(error, 'Recovered stale lock')
    WHERE status = 'running'
      AND locked_at IS NOT NULL
      AND locked_at < now() - make_interval(mins => ${staleMinutes})
    RETURNING id`;
  return rows.length;
}

export async function getJob(runId: string) {
  const rows = await sql`
    SELECT id, agent_id, task, status, attempts, max_attempts, error, result, provider, model, started_at, completed_at, input, metadata
    FROM agent_runs WHERE id = ${runId}::uuid LIMIT 1`;
  return rows[0] || null;
}
