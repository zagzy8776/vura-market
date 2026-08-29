/**
 * Governed Agent Missions.
 *
 * A mission is a small directed-acyclic graph (DAG) of steps. Every autonomous
 * agent step runs through the existing governed runAgentToolLoop + executeTool
 * path (never enqueueAgentJob): runAgentToolLoop only exposes read/draft tools
 * and executeTool enforces policy + approval risk + audit, so no write,
 * publishing, social, payment, messaging, or destructive action can run
 * autonomously. The growth mission terminates in an explicit human-approval
 * gate before any future publishing/write action.
 *
 * Backend only for now. No external side effects are ever triggered.
 */
import { randomUUID } from 'crypto';
import { sql } from '../db.js';
import { runAgentToolLoop } from './tool-loop.js';
import type { AgentContext, AgentId, ModelProvider } from './types.js';

export type MissionType = 'growth';

export type MissionStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MissionStepStatus =
  | 'pending'
  | 'ready'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'awaiting_approval'
  | 'skipped';

export type MissionStepDef = {
  stepKey: string;
  agentId?: AgentId | null;
  dependsOn: string[];
  sortOrder: number;
  synthetic?: 'approval_gate';
  role?: string;
  toolNames?: string[];
};

/** Growth mission: Product → Marketing → Sales → Operations → human approval gate. */
export const GROWTH_DAG: MissionStepDef[] = [
  {
    stepKey: 'product',
    agentId: 'product-intelligence',
    dependsOn: [],
    sortOrder: 10,
    role: 'Product Intelligence — research + inspect the target product, analyze specs and market price, and return a structured product brief. Never invent specs.',
  },
  {
    stepKey: 'marketing',
    agentId: 'marketing-intelligence',
    dependsOn: ['product'],
    sortOrder: 20,
    role: 'Marketing Intelligence — research the opportunity and the Vura catalog, determine positioning, and return content/campaign recommendations. Do not publish.',
  },
  {
    stepKey: 'sales',
    agentId: 'sales',
    dependsOn: ['marketing'],
    sortOrder: 30,
    role: 'Sales Intelligence — analyze product/order/inventory data, identify sales opportunities, and return prioritized human outreach recommendations. Do not message customers.',
  },
  {
    stepKey: 'operations',
    agentId: 'operations',
    dependsOn: ['sales'],
    sortOrder: 40,
    role: 'Operations Intelligence — monitor orders/inventory/shipping/payment state, surface exceptions, and propose actions. Do not mutate data.',
  },
  {
    stepKey: 'approval_gate',
    agentId: null,
    dependsOn: ['operations'],
    sortOrder: 50,
    synthetic: 'approval_gate',
  },
];

function safeJson(value: unknown) {
  try {
    const text = JSON.stringify(value);
    return text && text.length > 20000 ? `${text.slice(0, 20000)}…` : text ?? '{}';
  } catch {
    return '{}';
  }
}

export function stepByKey(stepKey: string): MissionStepDef | undefined {
  return GROWTH_DAG.find((s) => s.stepKey === stepKey);
}

/** Resolve which steps are ready to run given current step statuses (pure). */
export function resolveReadySteps(
  defs: MissionStepDef[],
  statusByKey: Record<string, MissionStepStatus>,
): MissionStepDef[] {
  return defs
    .filter((s) => statusByKey[s.stepKey] === 'pending')
    .filter((s) => s.dependsOn.every((dep) => statusByKey[dep] === 'completed'))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Pure mission finalization rules (no DB): priority await_approval > completed
 * > failed > running. Missions are never marked completed past an un-cleared
 * approval gate, and never succeed when any step failed.
 */
export function finalizeMissionStatus(stepStatuses: MissionStepStatus[]): MissionStatus {
  if (stepStatuses.some((s) => s === 'awaiting_approval')) return 'awaiting_approval';
  if (stepStatuses.every((s) => s === 'completed' || s === 'skipped')) return 'completed';
  const inFlight = stepStatuses.some((s) =>
    s === 'pending' || s === 'ready' || s === 'queued' || s === 'running',
  );
  if (stepStatuses.some((s) => s === 'failed') && !inFlight) return 'failed';
  return 'running';
}

export async function createGrowthMission(input: {
  goal: string;
  categories?: string[];
  opportunityId?: string;
  productName?: string;
  createdBy?: string;
  correlationId?: string;
}) {
  const id = randomUUID();
  const correlationId = input.correlationId || `VURA-${new Date().toISOString().slice(0, 10)}-${id.slice(0, 8)}`;
  const goal = input.goal.trim().slice(0, 2000);
  if (goal.length < 3) throw new Error('Mission goal is required');

  const missionInput = {
    opportunityId: input.opportunityId || null,
    categories: input.categories || [],
    productName: input.productName || null,
  };

  await sql`
    INSERT INTO agent_missions (
      id, goal, mission_type, status, policy_level, correlation_id,
      opportunity_id, categories, input, created_by
    ) VALUES (
      ${id},
      ${goal},
      'growth',
      'queued',
      2,
      ${correlationId},
      ${input.opportunityId || null},
      ${JSON.stringify(input.categories || [])}::jsonb,
      ${safeJson(missionInput)}::jsonb,
      ${input.createdBy || null}
    )`;

  for (const step of GROWTH_DAG) {
    const stepInput = {
      ...missionInput,
      missionId: id,
      correlationId,
      stepKey: step.stepKey,
      goal,
    };
    await sql`
      INSERT INTO agent_mission_steps (
        id, mission_id, step_key, agent_id, depends_on, status, input, sort_order
      ) VALUES (
        ${randomUUID()},
        ${id},
        ${step.stepKey},
        ${step.agentId || null},
        ${step.dependsOn},
        ${step.dependsOn.length === 0 ? 'ready' : 'pending'},
        ${safeJson(stepInput)}::jsonb,
        ${step.sortOrder}
      )`;
  }

  return { missionId: id, correlationId, status: 'queued' as const };
}

export async function getMission(missionId: string) {
  const rows = await sql`
    SELECT id, goal, mission_type, status, policy_level, correlation_id,
           opportunity_id, categories, input, result, error,
           created_at, started_at, completed_at, created_by
    FROM agent_missions WHERE id = ${missionId}::uuid LIMIT 1`;
  if (!rows[0]) return null;
  const steps = await sql`
    SELECT id, mission_id, step_key, agent_id, depends_on, status, run_id,
           input, result, attempts, max_attempts, error, sort_order,
           started_at, completed_at
    FROM agent_mission_steps
    WHERE mission_id = ${missionId}::uuid
    ORDER BY sort_order ASC`;
  return { mission: rows[0], steps };
}

export async function listMissions(limit = 20) {
  return sql`
    SELECT id, goal, mission_type, status, policy_level, correlation_id,
           opportunity_id, created_at, started_at, completed_at, error
    FROM agent_missions
    ORDER BY created_at DESC
    LIMIT ${Math.min(50, Math.max(1, limit))}`;
}

/**
 * Run a single autonomous agent step through the governed tool loop and mark
 * it completed / failed (or reset to `ready` for a bounded retry). Creates its
 * own agent_runs record so every executeTool audit event correlates to that run.
 * No write/destructive tool can reach the model (runAgentToolLoop exposes
 * read/draft only) and none can execute (executeTool enforces approval for
 * write/destructive).
 *
 * Retry: when `attempts < maxAttempts` a failure only resets the step to
 * `ready` (it will be re-run on a later tick), so transient provider/DB
 * errors do not kill a whole mission. Once `attempts >= maxAttempts` the step
 * is marked `failed` terminally. Retry never applies to the synthetic approval
 * gate (it has no agent) and never unlocks dependents, so approval-gate safety
 * and dependency ordering are preserved.
 */
export async function runAgentMissionStep(input: {
  stepId: string;
  runId: string;
  agentId: AgentId;
  stepKey: string;
  goal: string;
  role: string;
  providers?: ModelProvider[];
  toolNames?: string[];
  maxTurns?: number;
  attempts?: number;
  maxAttempts?: number;
}) {
  const providers = input.providers ?? (['groq', 'cerebras', 'gemini'] as ModelProvider[]);
  const context: AgentContext = {
    agentId: input.agentId,
    runId: input.runId,
    task: `mission:${input.stepKey}`,
  };

  const system = [
    `You are the "${input.role}" step of a Vura Growth mission.`,
    'Use only the governed tools provided. Never invent facts, URLs, prices, demand, or specs. If evidence is insufficient, say so. Do not write, publish, message, pay, or mutate anything.',
    `Mission goal: ${input.goal}`,
  ].join('\n');

  const task = `Produce the structured result for the "${input.stepKey}" step of this Growth mission.\nGoal: ${input.goal}`;

  try {
    const loop = await runAgentToolLoop(context, {
      system,
      task,
      providers,
      maxTurns: input.maxTurns ?? 4,
      tools: input.toolNames,
    });
    const result = {
      stepKey: input.stepKey,
      text: loop.text,
      provider: loop.provider,
      model: loop.model,
      stoppedReason: loop.stoppedReason,
      usage: loop.usage,
    };
    if (loop.stoppedReason !== 'final' || !loop.text.trim()) {
      const reason = `Loop did not finalize: ${loop.stoppedReason}`;
      await markStepOutcome(input, reason);
      return { ok: false as const, reason, retryable: shouldRetry(input) };
    }
    await markStepCompleted(input.stepId, result);
    return { ok: true as const, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mission step failed';
    await markStepOutcome(input, message);
    return { ok: false as const, error: message, retryable: shouldRetry(input) };
  }
}

function shouldRetry(input: { attempts?: number; maxAttempts?: number }) {
  const attempts = input.attempts;
  const maxAttempts = input.maxAttempts;
  // Retry only when the caller explicitly opts in with attempts + maxAttempts
  // and the current attempt is still within the bound. Without explicit bounds
  // a failure is terminal (prior behavior).
  return attempts != null && maxAttempts != null && attempts > 0 && attempts < maxAttempts;
}

/**
 * Decide the step status on a failed run: bounded retry (reset to `ready`) or
 * terminal `failed`. Retry is only allowed for real agent steps (never the
 * synthetic approval gate), only up to maxAttempts, and only when the step is
 * still in `running` state (to avoid racing a concurrent successful finalize).
 */
async function markStepOutcome(
  input: { stepId: string; attempts?: number; maxAttempts?: number },
  error: string,
) {
  const retry = shouldRetry(input);
  if (retry) {
    await sql`
      UPDATE agent_mission_steps
      SET status = 'ready',
          error = ${error.slice(0, 2000)},
          run_id = NULL,
          completed_at = NULL,
          started_at = NULL
      WHERE id = ${input.stepId}::uuid AND status = 'running'`;
  } else {
    await markStepFailed(input.stepId, error);
  }
}

async function markStepCompleted(stepId: string, result: unknown) {
  await sql`
    UPDATE agent_mission_steps
    SET status = 'completed',
        result = ${safeJson(result)}::jsonb,
        completed_at = now(),
        error = null
    WHERE id = ${stepId}::uuid`;
}

async function markStepFailed(stepId: string, error: string) {
  await sql`
    UPDATE agent_mission_steps
    SET status = 'failed',
        error = ${error.slice(0, 2000)},
        completed_at = now()
    WHERE id = ${stepId}::uuid`;
}

async function unlockDependents(missionId: string) {
  const steps = await sql`
    SELECT id, step_key, depends_on, status
    FROM agent_mission_steps
    WHERE mission_id = ${missionId}::uuid`;
  const byKey = new Map(steps.map((s) => [String(s.step_key), s]));
  for (const step of steps) {
    if (String(step.status) !== 'pending') continue;
    const deps = (step.depends_on as string[]) || [];
    const allDone = deps.every((d) => {
      const dep = byKey.get(d);
      return dep && String(dep.status) === 'completed';
    });
    if (allDone) {
      await sql`
        UPDATE agent_mission_steps
        SET status = 'ready'
        WHERE id = ${String(step.id)}::uuid AND status = 'pending'`;
    }
  }
}

async function applyApprovalGate(missionId: string, stepId: string, correlationId: string) {
  await sql`
    UPDATE agent_mission_steps
    SET status = 'awaiting_approval',
        result = ${safeJson({
          type: 'approval_gate',
          message:
            'Growth mission intelligence complete. Approve in Command Center before any future publishing/write action. No autonomous side effects.',
          correlationId,
        })}::jsonb
    WHERE id = ${stepId}::uuid`;
  await sql`
    UPDATE agent_missions
    SET status = 'awaiting_approval'
    WHERE id = ${missionId}::uuid AND status IN ('queued', 'running')`;
}

/**
 * Advance a growth mission: run ready autonomous steps through the governed
 * loop, then apply the terminal approval gate. Safe to call; does not enqueue
 * jobs or touch external systems.
 */
export async function tickGrowthMission(missionId: string) {
  const mrows = await sql`
    SELECT id, goal, correlation_id, status FROM agent_missions WHERE id = ${missionId}::uuid LIMIT 1`;
  if (!mrows[0]) return { missionStatus: 'not_found' as const };
  const mission = mrows[0];
  const missionIdStr = String(mission.id);
  const correlationId = String(mission.correlation_id);

  if (String(mission.status) === 'queued') {
    await sql`UPDATE agent_missions SET status = 'running', started_at = COALESCE(started_at, now()) WHERE id = ${missionIdStr}::uuid AND status = 'queued'`;
  }

  await unlockDependents(missionIdStr);

  const ready = await sql`
    SELECT id, step_key, agent_id, depends_on, status, input, attempts, max_attempts
    FROM agent_mission_steps
    WHERE mission_id = ${missionIdStr}::uuid AND status = 'ready'
    ORDER BY sort_order ASC`;

  for (const step of ready) {
    const stepKey = String(step.step_key);
    const def = stepByKey(stepKey);
    const stepId = String(step.id);

    if (def?.synthetic === 'approval_gate') {
      await applyApprovalGate(missionIdStr, stepId, correlationId);
      continue;
    }

    const agentId = def?.agentId ?? null;
    if (!agentId) {
      await markStepFailed(stepId, 'Missing agent_id');
      continue;
    }

    // Create a dedicated governed run so audit events correlate to this step.
    const runId = randomUUID();
    await sql`INSERT INTO agent_runs (id, agent_id, task, status, metadata)
              VALUES (${runId}, ${agentId}, ${`mission:${stepKey} — ${String(mission.goal)}`}, 'running', ${safeJson({ missionId: missionIdStr, correlationId, stepKey })}::jsonb)`;
    // Claim the step atomically: only one tick may transition ready->running.
    // If a concurrent tick already claimed it, skip (prevents duplicate agent
    // execution). This is the core duplicate-execution guard for missions.
    const claimed = await sql`
      UPDATE agent_mission_steps
      SET status = 'running', run_id = ${runId}::uuid, attempts = attempts + 1,
          started_at = COALESCE(started_at, now())
      WHERE id = ${stepId}::uuid AND status = 'ready'
      RETURNING id`;
    if (!claimed.length) {
      await sql`DELETE FROM agent_runs WHERE id = ${runId}::uuid`;
      continue;
    }

    const attempts = Number(step.attempts || 0) + 1;
    const maxAttempts = Number(step.max_attempts || 3);

    const outcome = await runAgentMissionStep({
      stepId,
      runId,
      agentId,
      stepKey,
      goal: String(mission.goal),
      role: def?.role ?? 'Intelligence',
      attempts,
      maxAttempts,
    });

    const runStatus = outcome.ok ? 'completed' : 'failed';
    const error = outcome.ok ? null : (outcome as { error?: string }).error ?? 'Step failed';
    await sql`UPDATE agent_runs SET status = ${runStatus}, completed_at = now(), ${outcome.ok ? sql`result = ${safeJson(outcome.result)}::jsonb` : sql`error = ${error}`} WHERE id = ${runId}::uuid`;
  }

  // Finalize mission status from step statuses.
  const after = await sql`SELECT status FROM agent_mission_steps WHERE mission_id = ${missionIdStr}::uuid`;
  const statuses = after.map((s) => String(s.status)) as MissionStepStatus[];
  const final = finalizeMissionStatus(statuses);

  if (final === 'awaiting_approval') {
    await sql`UPDATE agent_missions SET status = 'awaiting_approval' WHERE id = ${missionIdStr}::uuid AND status IN ('queued', 'running')`;
  } else if (final === 'completed') {
    await sql`UPDATE agent_missions SET status = 'completed', completed_at = now() WHERE id = ${missionIdStr}::uuid AND status IN ('queued', 'running', 'awaiting_approval')`;
  } else if (final === 'failed') {
    await sql`UPDATE agent_missions SET status = 'failed', completed_at = now(), error = 'One or more steps failed' WHERE id = ${missionIdStr}::uuid AND status IN ('queued', 'running')`;
  }

  return { missionStatus: final };
}

/**
 * Recover mission steps stuck in a transient state (worker crash mid-step).
 * Resets them to `ready` so the next tick re-runs them through the governed
 * loop, and marks the superseded mission-owned agent_runs as failed so they are
 * never claimed by the generic job worker (no duplicate/cross execution).
 * Returns the number of steps recovered.
 */
export async function recoverStaleMissionSteps(staleMinutes = 15) {
  const stale = await sql`
    UPDATE agent_mission_steps
    SET status = 'ready',
        run_id = NULL,
        started_at = NULL,
        completed_at = NULL,
        error = COALESCE(error, 'Recovered stale step (worker restart)')
    WHERE status IN ('running', 'queued')
      AND started_at IS NOT NULL
      AND started_at < now() - make_interval(mins => ${staleMinutes})
    RETURNING id, mission_id, step_key`;
  for (const row of stale) {
    // Supersede the orphaned mission run so it is not double-executed.
    await sql`
      UPDATE agent_runs
      SET status = 'failed',
          error = COALESCE(error, 'Superceded by mission retry'),
          completed_at = now(),
          lock_token = NULL,
          locked_at = NULL
      WHERE metadata->>'missionId' = ${String(row.mission_id)}
        AND status IN ('running', 'queued')`;
  }
  return stale.length;
}

/**
 * Advance + recover due missions. Called by the Fly worker ticker (and safe to
 * call concurrently with the POST handler): per-step atomic ready->running
 * claims (RETURNING id) guarantee only one worker executes each step, so
 * mission steps are never duplicated under concurrent ticks.
 */
export async function tickAgentMissions(limit = 3) {
  const recovered = await recoverStaleMissionSteps(15).catch(() => 0);
  const due = await sql`
    SELECT id FROM agent_missions
    WHERE status IN ('queued', 'running')
    ORDER BY created_at ASC
    LIMIT ${Math.min(10, Math.max(1, limit))}`;
  const results: Array<{ missionId: string; status: MissionStatus | 'not_found' | 'error' }> = [];
  for (const row of due) {
    try {
      const r = await tickGrowthMission(String(row.id));
      results.push({ missionId: String(row.id), status: r.missionStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mission tick failed';
      await sql`
        UPDATE agent_missions
        SET error = ${message.slice(0, 2000)}
        WHERE id = ${String(row.id)}::uuid`;
      results.push({ missionId: String(row.id), status: 'error' });
    }
  }
  if (recovered > 0) {
    // After recovery there may be newly-ready steps to advance.
    const due2 = await sql`
      SELECT id FROM agent_missions
      WHERE status IN ('queued', 'running')
      ORDER BY created_at ASC
      LIMIT ${Math.min(10, Math.max(1, limit))}`;
    for (const row of due2) {
      const idStr = String(row.id);
      if (results.some((r) => r.missionId === idStr)) continue;
      try {
        const r = await tickGrowthMission(idStr);
        results.push({ missionId: idStr, status: r.missionStatus });
      } catch {
        // ignore — already surfaced by the caller's next tick
      }
    }
  }
  return { recovered, ticks: results };
}
