/**
 * Fly agent worker entry — long-running poll loop.
 * Bundled to agent-worker.mjs for the Fly process.
 */
import { randomUUID } from 'crypto';
import { claimNextJob, completeJob, failJob, recoverStaleLocks } from './job-queue.js';
import { runTrendIntelligence } from './trend-runner.js';
import { runProductIntelligence } from './product-runner.js';
import { analyzeSales } from './sales-intelligence.js';
import { analyzeOperations } from './operations-intelligence.js';
import { scoutMarketing } from './marketing-intelligence.js';
import { analyzeProductImages } from './image-intelligence.js';
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

async function executeJob(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>) {
  const context = { agentId: job.agentId, runId: job.runId, task: job.task };
  const input = job.input || {};

  switch (job.agentId as AgentId) {
    case 'trend-intelligence': {
      const categories = Array.isArray(input.categories)
        ? input.categories.filter((c): c is string => typeof c === 'string')
        : undefined;
      return runTrendIntelligence(context, categories);
    }
    case 'product-intelligence': {
      const imageUrls = Array.isArray(input.imageUrls)
        ? input.imageUrls.filter((u): u is string => typeof u === 'string')
        : [];
      if (imageUrls.length || input.jobType === 'image_analysis') {
        return analyzeProductImages(context, {
          imageUrls,
          productNameHint: typeof input.productName === 'string' ? input.productName : job.task,
          categoryHint: typeof input.category === 'string' ? input.category : undefined,
          userNotes: typeof input.userNotes === 'string' ? input.userNotes : undefined,
        });
      }
      return runProductIntelligence(context, {
        opportunityId: typeof input.opportunityId === 'string' ? input.opportunityId : undefined,
        productName: typeof input.productName === 'string' ? input.productName : job.task,
        category: typeof input.category === 'string' ? input.category : undefined,
      });
    }
    case 'sales':
      return analyzeSales(context);
    case 'operations':
      return analyzeOperations(context);
    case 'marketing-intelligence':
      return scoutMarketing(context, job.task);
    case 'engineering':
      return {
        note: 'Engineering agent worker stub — health probes land in Phase K',
        fly: { workerId: WORKER_ID, uptime: process.uptime() },
      };
    default:
      throw new Error(`Unsupported agent for worker: ${job.agentId}`);
  }
}

async function tick() {
  if (stopped || active >= CONCURRENCY) return;
  try {
    await recoverStaleLocks(15);
  } catch (e) {
    console.error('[agent-worker] recover', e);
  }

  active += 1;
  try {
    const job = await claimNextJob(WORKER_ID);
    if (!job) return;

    console.log(`[agent-worker] claimed ${job.agentId} run=${job.runId} attempt=${job.attempts}`);
    try {
      const result = await withTimeout(executeJob(job), JOB_TIMEOUT_MS);
      const provider = result && typeof result === 'object' && 'provider' in result
        ? String((result as { provider?: string }).provider || '') || undefined
        : undefined;
      const model = result && typeof result === 'object' && 'model' in result
        ? String((result as { model?: string }).model || '') || undefined
        : undefined;
      await completeJob(job.runId, job.lockToken, result, provider, model);
      console.log(`[agent-worker] completed run=${job.runId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job failed';
      const outcome = await failJob(job.runId, job.lockToken, message, job.attempts, job.maxAttempts);
      console.error(`[agent-worker] failed run=${job.runId}`, message, outcome);
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

// Allow direct node agent-worker.mjs
const isMain = typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('agent-worker');
if (isMain) startWorker();
