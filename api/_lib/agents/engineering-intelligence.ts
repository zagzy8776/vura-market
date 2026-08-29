/**
 * Phase K — Engineering Agent (READ/ANALYZE only).
 * Does not modify production code or infrastructure.
 *
 * Governance: all four health slices (failed jobs, stuck runs, queue depth,
 * notification volume) now read through the governed runtime.read tool via
 * executeTool(). Every read is policy-checked against the engineering policy,
 * bound to the owning runId in agent_events (tool.started/completed/failed),
 * returns only whitelisted fields, and cannot mutate the database.
 */
import { executeTool } from './runtime.js';
import type { AgentContext } from './types.js';

export interface EngineeringIncident {
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  evidence: string[];
  rootCause: string;
  affectedComponent: string;
  recommendedFix: string;
  testPlan: string;
  rollbackPlan: string;
  confidence: number;
}

type RuntimeRead = Record<string, unknown>;

async function readRuntime(context: AgentContext, scope: string): Promise<RuntimeRead | null> {
  try {
    const out = await executeTool(context.agentId, context.runId, 'runtime.read', { scope });
    return out && typeof out === 'object' ? (out as RuntimeRead) : {};
  } catch {
    // A failed runtime read must not crash the whole health scan; the failure
    // is already audited as tool.failed against this run.
    return null;
  }
}

export async function analyzeEngineering(context: AgentContext) {
  const evidence: string[] = [];
  const incidents: EngineeringIncident[] = [];

  const [failed, stuck, queued, notif] = await Promise.all([
    readRuntime(context, 'runs.failed'),
    readRuntime(context, 'runs.stuck'),
    readRuntime(context, 'runs.queued'),
    readRuntime(context, 'notifications'),
  ]);

  // 1. Failed agent jobs (last 24h)
  if (failed) {
    const total = Number(failed.total || 0);
    if (total > 0) {
      evidence.push(`${total} failed agent job(s) in last 24h`);
      const byAgent = (failed.byAgent ?? {}) as Record<string, number>;
      const failedRows = Array.isArray(failed.rows) ? (failed.rows as Array<{ agentId?: string; error?: string | null }>) : [];
      for (const [agent, count] of Object.entries(byAgent)) {
        if (count >= 2) {
          incidents.push({
            severity: count >= 5 ? 'high' : 'medium',
            title: `Repeated agent failures: ${agent}`,
            evidence: failedRows.filter((r) => r.agentId === agent).slice(0, 3).map((r) => String(r.error || '')),
            rootCause: 'Provider outage, missing secrets, or timeout under load',
            affectedComponent: `agent:${agent}`,
            recommendedFix: 'Check Fly logs, model/research keys, job timeouts, and Neon connectivity',
            testPlan: 'Enqueue a single sales or operations job and confirm queued→running→completed',
            rollbackPlan: 'Disable AGENT_WORKER_ENABLED temporarily; use sync:true for critical admin actions',
            confidence: 70,
          });
        }
      }
    }
  }

  // 2. Stuck running jobs
  if (stuck && Number(stuck.count || 0) > 0) {
    const c = Number(stuck.count);
    evidence.push(`${c} stuck running job(s)`);
    incidents.push({
      severity: 'medium',
      title: 'Stuck agent jobs detected',
      evidence: [`${c} runs locked >20m`],
      rootCause: 'Worker crash or long hang without timeout completion',
      affectedComponent: 'fly-agent-worker',
      recommendedFix: 'Stale-lock recovery should requeue; verify worker process and memory',
      testPlan: 'Confirm recoverStaleLocks runs; enqueue test job',
      rollbackPlan: 'Restart Fly machine; no schema rollback needed',
      confidence: 75,
    });
  }

  // 3. Queue depth
  if (queued && Number(queued.count || 0) > 20) {
    const c = Number(queued.count);
    evidence.push(`Queue depth ${c}`);
    incidents.push({
      severity: 'medium',
      title: 'Agent queue backlog',
      evidence: [`${c} queued jobs`],
      rootCause: 'Worker concurrency limited or providers slow',
      affectedComponent: 'neon-job-queue',
      recommendedFix: 'Allow temporary concurrency 2 if memory permits; rate-limit schedules',
      testPlan: 'Measure job duration metrics after change',
      rollbackPlan: 'Lower concurrency to 1',
      confidence: 65,
    });
  }

  // 4. Notification health (last 24h)
  if (notif) {
    evidence.push(`Notifications last 24h: ${Number(notif.last24h || 0)}`);
    const critical = Number(notif.critical24h || 0);
    if (critical > 0) {
      evidence.push(`${critical} critical notification(s) in last 24h`);
    }
  }

  if (!incidents.length) {
    incidents.push({
      severity: 'low',
      title: 'Engineering health nominal',
      evidence: evidence.length ? evidence : ['No critical signals in last 24h'],
      rootCause: 'n/a',
      affectedComponent: 'platform',
      recommendedFix: 'Continue scheduled health scans',
      testPlan: 'Re-run engineering agent on schedule',
      rollbackPlan: 'n/a',
      confidence: 80,
    });
  }

  return {
    incidents,
    evidence,
    workerHint: 'Fly agent worker processes long jobs; Vercel only enqueues by default',
    policy: 'READ/ANALYZE only — no automatic production code or infra changes',
  };
}
