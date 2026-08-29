/**
 * runtime.read — narrow, read-only agent runtime health tooling for the
 * Engineering agent.
 *
 * Safety model:
 *  - Read-only SELECTs against agent_runs / agent_notifications only. No
 *    writes, no deployment, no GitHub mutation, no database mutation.
 *  - No free-form SQL / user-controlled query text. Callers select from a
 *    fixed set of `scope` values; each maps to one closed query returning only
 *    the fields Engineering needs.
 *  - Gated by policy and audited through executeTool() (tool.started /
 *    tool.completed / tool.failed) against the owning run.
 */
import { sql } from '../../db.js';
import type { AgentTool } from '../types.js';

const SCOPE_ENUM = [
  'runs.failed',
  'runs.stuck',
  'runs.queued',
  'notifications',
] as const;
type Scope = (typeof SCOPE_ENUM)[number];

const FAILED_LIMIT = 20;
const QUEUED_BACKLOG_THRESHOLD = 20;

/**
 * Resolve a scope string into a type-safe scope. Returns null for any value
 * not in the closed enum so unknown input can never reach a query.
 */
export function resolveScope(value: unknown): Scope | null {
  return typeof value === 'string' && (SCOPE_ENUM as readonly string[]).includes(value)
    ? (value as Scope)
    : null;
}

export const runtimeReadTool: AgentTool = {
  name: 'runtime.read',
  description:
    'Read agent runtime health: failed agent runs (last 24h), stuck running jobs, queue depth, and recent agent-notification volume. Read-only. Select one fixed scope.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: [...SCOPE_ENUM],
        description:
          'Which health slice to read: runs.failed, runs.stuck, runs.queued, or notifications.',
      },
    },
    required: ['scope'],
  },
  async execute(input) {
    const scope = resolveScope((input as { scope?: unknown } | undefined)?.scope);
    if (!scope) throw new Error(`runtime.read scope must be one of: ${SCOPE_ENUM.join(', ')}`);

    switch (scope) {
      case 'runs.failed': {
        const rows = await sql`
          SELECT id, agent_id, task, error, attempts, completed_at
          FROM agent_runs
          WHERE status = 'failed' AND completed_at > now() - interval '24 hours'
          ORDER BY completed_at DESC LIMIT ${FAILED_LIMIT}`;
        const byAgent: Record<string, number> = {};
        for (const r of rows) {
          const a = String(r.agent_id || 'unknown');
          byAgent[a] = (byAgent[a] || 0) + 1;
        }
        return {
          scope,
          total: rows.length,
          byAgent,
          rows: rows.map((r) => ({
            id: String(r.id),
            agentId: String(r.agent_id),
            error: r.error ? String(r.error).slice(0, 400) : null,
            attempts: Number(r.attempts || 0),
            completedAt: r.completed_at || null,
          })),
          source: 'vura.agent_runs',
        };
      }
      case 'runs.stuck': {
        const rows = await sql`
          SELECT COUNT(*)::int AS c, MIN(locked_at) AS oldest_lock
          FROM agent_runs
          WHERE status = 'running' AND locked_at < now() - interval '20 minutes'`;
        return {
          scope,
          count: Number(rows[0]?.c || 0),
          oldestLock: rows[0]?.oldest_lock ?? null,
          source: 'vura.agent_runs',
        };
      }
      case 'runs.queued': {
        const rows = await sql`
          SELECT COUNT(*)::int AS c, MIN(next_run_at) AS next_due_at
          FROM agent_runs
          WHERE status = 'queued'`;
        const count = Number(rows[0]?.c || 0);
        return {
          scope,
          count,
          backlog: count > QUEUED_BACKLOG_THRESHOLD,
          nextDueAt: rows[0]?.next_due_at ?? null,
          source: 'vura.agent_runs',
        };
      }
      case 'notifications': {
        const rows = await sql`
          SELECT COUNT(*)::int AS last_24h,
                 COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical_24h
          FROM agent_notifications
          WHERE created_at > now() - interval '24 hours'`;
        return {
          scope,
          last24h: Number(rows[0]?.last_24h || 0),
          critical24h: Number(rows[0]?.critical_24h || 0),
          source: 'vura.agent_notifications',
        };
      }
    }
  },
};
