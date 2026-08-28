/**
 * Fly agent worker — poll loop + schedule ticker.
 */
import { randomUUID } from 'crypto';
import { claimNextJob, completeJob, failJob, recoverStaleLocks, enqueueAgentJob } from './job-queue.js';
import { runTrendIntelligence } from './trend-runner.js';
import { runProductIntelligence } from './product-runner.js';
import { analyzeSales } from './sales-intelligence.js';
import { analyzeOperations } from './operations-intelligence.js';
import { scoutMarketing } from './marketing-intelligence.js';
import { analyzeProductImages } from './image-intelligence.js';
import { analyzeEngineering } from './engineering-intelligence.js';
import { emitCoordination } from './coordination.js';
import { remember } from './memory.js';
import { sql } from '../db.js';
import type { AgentId } from './types.js';

const WORKER_ID = process.env.FLY_MACHINE_ID || process.env.WORKER_ID || randomUUID().slice(0, 8);
const POLL_MS = Number(process.env.AGENT_WORKER_POLL_MS || 4000);
const CONCURRENCY = Math.max(1, Math.min(2, Number(process.env.AGENT_WORKER_CONCURRENCY || 1)));
const JOB_TIMEOUT_MS = Number(process.env.AGENT_JOB_TIMEOUT_MS || 120_000);

let active = 0;
let stopped = false;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Job timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function tickSchedules() {
  try {
    const due = await sql`
      SELECT id, agent_id, task, input, interval_minutes
      FROM agent_schedules
      WHERE enabled = true AND next_run_at <= now()
      LIMIT 5`;
    for (const row of due) {
      const agentId = String(row.agent_id) as AgentId;
      const task = String(row.task);
      const input = (row.input || {}) as Record<string, unknown>;
      const interval = Number(row.interval_minutes) || 360;
      await enqueueAgentJob({
        agentId,
        task,
        input: { ...input, scheduled: true, scheduleId: row.id },
        idempotencyKey: `schedule:${row.id}:${new Date().toISOString().slice(0, 13)}`,
      });
      await sql`
        UPDATE agent_schedules
        SET last_enqueued_at = now(),
            next_run_at = now() + make_interval(mins => ${interval})
        WHERE id = ${String(row.id)}`;
    }
  } catch (e) {
    console.error('[agent-worker] schedules', e);
  }
}

async function executeJob(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>) {
  const context = { agentId: job.agentId, runId: job.runId, task: job.task };
  const input = job.input || {};
  const correlationId =
    typeof input.correlationId === 'string' ? input.correlationId : job.runId;

  let result: unknown;

  switch (job.agentId as AgentId) {
    case 'trend-intelligence': {
      const categories = Array.isArray(input.categories)
        ? input.categories.filter((c): c is string => typeof c === 'string')
        : undefined;
      result = await runTrendIntelligence(context, categories);
      const opportunities = (result as { opportunities?: Array<{ id: string }> }).opportunities || [];
      for (const op of opportunities.slice(0, 3)) {
        await emitCoordination({
          fromAgent: 'trend-intelligence',
          event: 'opportunity.created',
          correlationId: `${correlationId}:${op.id}`,
          parentRunId: job.runId,
          sourceOpportunityId: op.id,
          payload: { opportunityId: op.id },
        });
      }
      break;
    }
    case 'product-intelligence': {
      const imageUrls = Array.isArray(input.imageUrls)
        ? input.imageUrls.filter((u): u is string => typeof u === 'string')
        : [];
      if (imageUrls.length || input.jobType === 'image_analysis') {
        result = await analyzeProductImages(context, {
          imageUrls,
          productNameHint: typeof input.productName === 'string' ? input.productName : job.task,
          categoryHint: typeof input.category === 'string' ? input.category : undefined,
          userNotes: typeof input.userNotes === 'string' ? input.userNotes : undefined,
        });
      } else {
        result = await runProductIntelligence(context, {
          opportunityId: typeof input.opportunityId === 'string' ? input.opportunityId : undefined,
          productName: typeof input.productName === 'string' ? input.productName : job.task,
          category: typeof input.category === 'string' ? input.category : undefined,
        });
      }
      await emitCoordination({
        fromAgent: 'product-intelligence',
        event: 'product.research.completed',
        correlationId,
        parentRunId: job.runId,
        sourceOpportunityId: typeof input.opportunityId === 'string' ? input.opportunityId : undefined,
        payload: { productName: typeof input.productName === 'string' ? input.productName : job.task },
      });
      break;
    }
    case 'sales':
      result = await analyzeSales(context);
      await emitCoordination({
        fromAgent: 'sales',
        event: 'commercial.signal.created',
        correlationId,
        parentRunId: job.runId,
        payload: { insights: (result as { insights?: string[] }).insights?.slice(0, 3) },
      });
      break;
    case 'operations':
      result = await analyzeOperations(context);
      break;
    case 'marketing-intelligence':
      result = await scoutMarketing(context, job.task);
      await emitCoordination({
        fromAgent: 'marketing-intelligence',
        event: 'marketing.brief.completed',
        correlationId,
        parentRunId: job.runId,
        payload: { brief: (result as { brief?: unknown }).brief },
      });
      break;
    case 'engineering':
      result = await analyzeEngineering(context);
      break;
    default:
      throw new Error(`Unsupported agent for worker: ${job.agentId}`);
  }

  await remember({
    agentId: job.agentId,
    kind: 'outcome',
    content: `Completed ${job.agentId}: ${job.task}`.slice(0, 500),
    runId: job.runId,
    correlationId,
    importance: 40,
    metadata: { durationHint: true },
  }).catch(() => undefined);

  return result;
}

async function tick() {
  if (stopped || active >= CONCURRENCY) return;
  try {
    await recoverStaleLocks(15);
    await tickSchedules();
  } catch (e) {
    console.error('[agent-worker] recover/schedule', e);
  }

  active += 1;
  try {
    const job = await claimNextJob(WORKER_ID);
    if (!job) return;

    console.log(`[agent-worker] claimed ${job.agentId} run=${job.runId} attempt=${job.attempts}`);
    try {
      const result = await withTimeout(executeJob(job), JOB_TIMEOUT_MS);
      const provider =
        result && typeof result === 'object' && 'provider' in result
          ? String((result as { provider?: string }).provider || '') || undefined
          : undefined;
      const model =
        result && typeof result === 'object' && 'model' in result
          ? String((result as { model?: string }).model || '') || undefined
          : undefined;
      await completeJob(job.runId, job.lockToken, result, provider, model);
      console.log(`[agent-worker] completed run=${job.runId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job failed';
      const outcome = await failJob(job.runId, job.lockToken, message, job.attempts, job.maxAttempts);
      console.error(`[agent-worker] failed run=${job.runId}`, message, outcome);
      await remember({
        agentId: job.agentId,
        kind: 'failure',
        content: message.slice(0, 1000),
        runId: job.runId,
        importance: 70,
      }).catch(() => undefined);
    }
  } catch (e) {
    console.error('[agent-worker] tick', e);
  } finally {
    active -= 1;
  }
}

export function startWorker() {
  if (process.env.AGENT_WORKER_ENABLED === 'false') {
    console.log('[agent-worker] disabled via AGENT_WORKER_ENABLED=false');
    return;
  }
  console.log(`[agent-worker] starting id=${WORKER_ID} poll=${POLL_MS}ms concurrency=${CONCURRENCY}`);
  const onStop = () => {
    stopped = true;
    console.log('[agent-worker] graceful stop requested');
  };
  process.on('SIGTERM', onStop);
  process.on('SIGINT', onStop);

  const loop = () => {
    if (stopped) return;
    void tick().finally(() => {
      if (!stopped) setTimeout(loop, POLL_MS);
    });
  };
  loop();
}

export function stopWorker() {
  stopped = true;
}

const isMain = typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('agent-worker');
if (isMain) startWorker();
