/**
 * Mission orchestrator — parallel DAG on top of the existing Neon/Fly job queue.
 * Does NOT auto-publish, send, refund, or deploy.
 */
import { randomUUID } from 'crypto';
import { sql } from '../db.js';
import { enqueueAgentJob } from './job-queue.js';
import { remember } from './memory.js';
import type { AgentId } from './types.js';

export type MissionType = 'growth' | 'system_health';

export type MissionStepDef = {
  stepKey: string;
  agentId?: AgentId | null;
  dependsOn: string[];
  sortOrder: number;
  synthetic?: 'reconcile' | 'listing_draft' | 'await_approval';
};

/** First end-to-end growth DAG (no social publish yet). */
export const GROWTH_DAG: MissionStepDef[] = [
  { stepKey: 'product', agentId: 'product-intelligence', dependsOn: [], sortOrder: 10 },
  { stepKey: 'marketing', agentId: 'marketing-intelligence', dependsOn: [], sortOrder: 20 },
  { stepKey: 'sales', agentId: 'sales', dependsOn: [], sortOrder: 30 },
  { stepKey: 'operations', agentId: 'operations', dependsOn: [], sortOrder: 40 },
  { stepKey: 'reconcile', agentId: null, dependsOn: ['product', 'marketing', 'sales', 'operations'], sortOrder: 50, synthetic: 'reconcile' },
  { stepKey: 'listing_draft', agentId: null, dependsOn: ['reconcile'], sortOrder: 60, synthetic: 'listing_draft' },
  { stepKey: 'await_approval', agentId: null, dependsOn: ['listing_draft'], sortOrder: 70, synthetic: 'await_approval' },
];

export const SYSTEM_HEALTH_DAG: MissionStepDef[] = [
  { stepKey: 'engineering', agentId: 'engineering', dependsOn: [], sortOrder: 10 },
  { stepKey: 'reconcile', agentId: null, dependsOn: ['engineering'], sortOrder: 50, synthetic: 'reconcile' },
  { stepKey: 'await_approval', agentId: null, dependsOn: ['reconcile'], sortOrder: 70, synthetic: 'await_approval' },
];

function safeJson(value: unknown) {
  try {
    const text = JSON.stringify(value);
    return text && text.length > 20000 ? `${text.slice(0, 20000)}…` : text ?? '{}';
  } catch {
    return '{}';
  }
}

export async function createMission(input: {
  goal: string;
  missionType?: MissionType;
  policyLevel?: number;
  opportunityId?: string;
  categories?: string[];
  productName?: string;
  createdBy?: string;
  correlationId?: string;
}) {
  const id = randomUUID();
  const correlationId = input.correlationId || `VURA-${new Date().toISOString().slice(0, 10)}-${id.slice(0, 8)}`;
  const missionType: MissionType = input.missionType || 'growth';
  const policyLevel = Math.min(4, Math.max(0, input.policyLevel ?? 2));
  const dag = missionType === 'system_health' ? SYSTEM_HEALTH_DAG : GROWTH_DAG;
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
      ${missionType},
      'queued',
      ${policyLevel},
      ${correlationId},
      ${input.opportunityId || null},
      ${JSON.stringify(input.categories || [])}::jsonb,
      ${safeJson(missionInput)}::jsonb,
      ${input.createdBy || null}
    )`;

  for (const step of dag) {
    const stepId = randomUUID();
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
        ${stepId},
        ${id},
        ${step.stepKey},
        ${step.agentId || null},
        ${step.dependsOn},
        ${step.dependsOn.length === 0 ? 'ready' : 'pending'},
        ${safeJson(stepInput)}::jsonb,
        ${step.sortOrder}
      )`;
  }

  await remember({
    agentId: 'trend-intelligence',
    kind: 'signal',
    content: `Mission created: ${goal}`.slice(0, 500),
    correlationId,
    opportunityId: input.opportunityId,
    importance: 70,
    metadata: { missionId: id, missionType },
  }).catch(() => undefined);

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
  const rows = await sql`
    SELECT id, goal, mission_type, status, policy_level, correlation_id,
           opportunity_id, created_at, started_at, completed_at, error
    FROM agent_missions
    ORDER BY created_at DESC
    LIMIT ${Math.min(50, Math.max(1, limit))}`;
  return rows;
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

function syntheticDef(stepKey: string): MissionStepDef | undefined {
  return [...GROWTH_DAG, ...SYSTEM_HEALTH_DAG].find((s) => s.stepKey === stepKey && s.synthetic);
}

async function runSynthetic(
  step: { id: string; step_key: string; input: unknown },
  missionId: string,
  correlationId: string,
) {
  const def = syntheticDef(String(step.step_key));
  if (!def?.synthetic) return;

  const sibling = await sql`
    SELECT step_key, status, result, agent_id
    FROM agent_mission_steps
    WHERE mission_id = ${missionId}::uuid`;

  if (def.synthetic === 'reconcile') {
    const parts: Record<string, unknown> = {};
    for (const s of sibling) {
      if (['product', 'marketing', 'sales', 'operations', 'engineering'].includes(String(s.step_key))) {
        parts[String(s.step_key)] = { status: s.status, result: s.result };
      }
    }
    const productOk = parts.product && (parts.product as { status: string }).status === 'completed';
    const ops = parts.operations as { status: string } | undefined;
    const opsOk = !ops || ops.status === 'completed';
    const reconciled = {
      type: 'reconcile',
      readyForListing: Boolean(productOk && opsOk),
      parts,
      notes: productOk
        ? 'Product + parallel intel collected. Listing draft may proceed.'
        : 'Product intelligence incomplete — listing draft still prepared for human review.',
      correlationId,
    };
    await markStepCompleted(String(step.id), reconciled);
    return;
  }

  if (def.synthetic === 'listing_draft') {
    const productStep = sibling.find((s) => String(s.step_key) === 'product');
    const marketingStep = sibling.find((s) => String(s.step_key) === 'marketing');
    const opsStep = sibling.find((s) => String(s.step_key) === 'operations');
    const draft = {
      type: 'listing_draft',
      status: 'draft',
      policy: 'Requires human approval before any catalog write or publish',
      product: productStep?.result ?? null,
      marketing: marketingStep?.result ?? null,
      operations: opsStep?.result ?? null,
      provenance: { note: 'Specs must be verified. AI must not invent RAM/storage/model numbers.' },
      correlationId,
      missionId,
    };
    await markStepCompleted(String(step.id), draft);
    await sql`
      UPDATE agent_missions
      SET result = COALESCE(result, '{}'::jsonb) || ${safeJson({ listingDraft: draft })}::jsonb
      WHERE id = ${missionId}::uuid`;
    return;
  }

  if (def.synthetic === 'await_approval') {
    await sql`
      UPDATE agent_mission_steps
      SET status = 'awaiting_approval',
          result = ${safeJson({
            type: 'await_approval',
            message: 'Listing draft ready. Approve in Command Center before product write.',
            correlationId,
          })}::jsonb
      WHERE id = ${String(step.id)}::uuid`;
    await sql`
      UPDATE agent_missions
      SET status = 'awaiting_approval'
      WHERE id = ${missionId}::uuid AND status IN ('queued', 'running')`;
  }
}

/** Advance all active missions. Idempotent; safe every worker tick. */
export async function tickMissions() {
  const active = await sql`
    SELECT id, correlation_id, status, goal, input
    FROM agent_missions
    WHERE status IN ('queued', 'running')
    ORDER BY created_at ASC
    LIMIT 10`;

  for (const mission of active) {
    const missionId = String(mission.id);
    const correlationId = String(mission.correlation_id);

    if (String(mission.status) === 'queued') {
      await sql`
        UPDATE agent_missions
        SET status = 'running', started_at = COALESCE(started_at, now())
        WHERE id = ${missionId}::uuid AND status = 'queued'`;
    }

    await unlockDependents(missionId);

    const ready = await sql`
      SELECT id, step_key, agent_id, input, depends_on, attempts, max_attempts, status
      FROM agent_mission_steps
      WHERE mission_id = ${missionId}::uuid AND status = 'ready'
      ORDER BY sort_order ASC`;

    for (const step of ready) {
      const stepKey = String(step.step_key);
      const def = syntheticDef(stepKey);
      if (def?.synthetic) {
        try {
          await runSynthetic(step as { id: string; step_key: string; input: unknown }, missionId, correlationId);
          await unlockDependents(missionId);
        } catch (e) {
          await markStepFailed(String(step.id), e instanceof Error ? e.message : 'Synthetic step failed');
        }
        continue;
      }

      const agentId = step.agent_id ? (String(step.agent_id) as AgentId) : null;
      if (!agentId) {
        await markStepFailed(String(step.id), 'Missing agent_id');
        continue;
      }

      const idempotencyKey = `${correlationId}:${stepKey}`;
      const job = await enqueueAgentJob({
        agentId,
        task: `${String(mission.goal)} — step ${stepKey}`,
        input: {
          ...((step.input || {}) as Record<string, unknown>),
          missionId,
          correlationId,
          stepKey,
          stepId: String(step.id),
        },
        idempotencyKey,
      });

      await sql`
        UPDATE agent_mission_steps
        SET status = 'queued',
            run_id = ${job.runId}::uuid,
            attempts = attempts + 1,
            started_at = COALESCE(started_at, now())
        WHERE id = ${String(step.id)}::uuid AND status = 'ready'`;
    }

    const linked = await sql`
      SELECT s.id AS step_id, s.run_id, r.status AS run_status, r.result, r.error
      FROM agent_mission_steps s
      JOIN agent_runs r ON r.id = s.run_id
      WHERE s.mission_id = ${missionId}::uuid
        AND s.status IN ('queued', 'running')
        AND s.run_id IS NOT NULL`;

    for (const row of linked) {
      const runStatus = String(row.run_status);
      if (runStatus === 'running') {
        await sql`UPDATE agent_mission_steps SET status = 'running' WHERE id = ${String(row.step_id)}::uuid AND status = 'queued'`;
      } else if (runStatus === 'completed') {
        await markStepCompleted(String(row.step_id), row.result ?? {});
        await unlockDependents(missionId);
      } else if (runStatus === 'failed') {
        await markStepFailed(String(row.step_id), String(row.error || 'Agent run failed'));
      } else if (runStatus === 'awaiting_approval') {
        await sql`UPDATE agent_mission_steps SET status = 'awaiting_approval' WHERE id = ${String(row.step_id)}::uuid`;
        await sql`UPDATE agent_missions SET status = 'awaiting_approval' WHERE id = ${missionId}::uuid AND status = 'running'`;
      }
    }

    const after = await sql`SELECT status FROM agent_mission_steps WHERE mission_id = ${missionId}::uuid`;
    const statuses = after.map((s) => String(s.status));
    if (statuses.some((s) => s === 'awaiting_approval')) {
      await sql`UPDATE agent_missions SET status = 'awaiting_approval' WHERE id = ${missionId}::uuid AND status = 'running'`;
    } else if (statuses.every((s) => s === 'completed' || s === 'skipped')) {
      await sql`UPDATE agent_missions SET status = 'completed', completed_at = now() WHERE id = ${missionId}::uuid AND status IN ('queued', 'running', 'awaiting_approval')`;
    } else if (statuses.some((s) => s === 'failed') && !statuses.some((s) => ['pending', 'ready', 'queued', 'running'].includes(s))) {
      await sql`UPDATE agent_missions SET status = 'failed', completed_at = now(), error = 'One or more steps failed' WHERE id = ${missionId}::uuid AND status IN ('queued', 'running')`;
    }
  }
}
