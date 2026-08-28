/**
 * Phase K — Engineering Agent (READ/ANALYZE only).
 * Does not modify production code or infrastructure.
 */
import { sql } from '../db.js';
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

export async function analyzeEngineering(_context: AgentContext) {
  const evidence: string[] = [];
  const incidents: EngineeringIncident[] = [];

  // Failed agent jobs
  const failedJobs = await sql`
    SELECT id, agent_id, task, error, attempts, completed_at
    FROM agent_runs
    WHERE status = 'failed' AND completed_at > now() - interval '24 hours'
    ORDER BY completed_at DESC LIMIT 20`;
  if (failedJobs.length) {
    evidence.push(`${failedJobs.length} failed agent job(s) in last 24h`);
    const byAgent: Record<string, number> = {};
    for (const j of failedJobs) {
      const a = String(j.agent_id);
      byAgent[a] = (byAgent[a] || 0) + 1;
    }
    for (const [agent, count] of Object.entries(byAgent)) {
      if (count >= 2) {
        incidents.push({
          severity: count >= 5 ? 'high' : 'medium',
          title: `Repeated agent failures: ${agent}`,
          evidence: failedJobs.filter((j) => j.agent_id === agent).slice(0, 3).map((j) => String(j.error || j.id)),
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

  // Stuck running jobs
  const stuck = await sql`
    SELECT COUNT(*)::int AS c FROM agent_runs
    WHERE status = 'running' AND locked_at < now() - interval '20 minutes'`;
  if (stuck[0] && Number(stuck[0].c) > 0) {
    evidence.push(`${stuck[0].c} stuck running job(s)`);
    incidents.push({
      severity: 'medium',
      title: 'Stuck agent jobs detected',
      evidence: [`${stuck[0].c} runs locked >20m`],
      rootCause: 'Worker crash or long hang without timeout completion',
      affectedComponent: 'fly-agent-worker',
      recommendedFix: 'Stale-lock recovery should requeue; verify worker process and memory',
      testPlan: 'Confirm recoverStaleLocks runs; enqueue test job',
      rollbackPlan: 'Restart Fly machine; no schema rollback needed',
      confidence: 75,
    });
  }

  // Queue depth
  const queued = await sql`SELECT COUNT(*)::int AS c FROM agent_runs WHERE status = 'queued'`;
  if (queued[0] && Number(queued[0].c) > 20) {
    evidence.push(`Queue depth ${queued[0].c}`);
    incidents.push({
      severity: 'medium',
      title: 'Agent queue backlog',
      evidence: [`${queued[0].c} queued jobs`],
      rootCause: 'Worker concurrency limited or providers slow',
      affectedComponent: 'neon-job-queue',
      recommendedFix: 'Allow temporary concurrency 2 if memory permits; rate-limit schedules',
      testPlan: 'Measure job duration metrics after change',
      rollbackPlan: 'Lower concurrency to 1',
      confidence: 65,
    });
  }

  // Recent opportunities / notifications health
  const notif = await sql`SELECT COUNT(*)::int AS c FROM agent_notifications WHERE created_at > now() - interval '24 hours'`;
  evidence.push(`Notifications last 24h: ${notif[0]?.c ?? 0}`);

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
