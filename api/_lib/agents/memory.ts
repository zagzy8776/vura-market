import { sql } from '../db.js';

export type MemoryKind = 'observation' | 'source' | 'decision' | 'outcome' | 'signal' | 'failure';

const MAX_PER_AGENT = 500;

export async function remember(input: {
  agentId: string;
  kind: MemoryKind;
  content: string;
  metadata?: Record<string, unknown>;
  importance?: number;
  correlationId?: string;
  opportunityId?: string;
  runId?: string;
  ttlDays?: number;
}) {
  const importance = Math.min(100, Math.max(0, Math.round(input.importance ?? 50)));
  const rows = await sql`
    INSERT INTO agent_memory (agent_id, kind, content, metadata, importance, correlation_id, opportunity_id, run_id)
    VALUES (
      ${input.agentId},
      ${input.kind},
      ${input.content.slice(0, 4000)},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      ${importance},
      ${input.correlationId ?? null},
      ${input.opportunityId ?? null},
      ${input.runId ?? null}
    )
    RETURNING id`;
  // Bound memory: delete oldest low-importance beyond cap
  await sql`
    DELETE FROM agent_memory WHERE id IN (
      SELECT id FROM (
        SELECT id FROM agent_memory
        WHERE agent_id = ${input.agentId}
        ORDER BY importance ASC, created_at ASC
        OFFSET ${MAX_PER_AGENT}
      ) old_rows
    )`.catch(() => undefined);
  // Expire
  await sql`DELETE FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at < now()`.catch(() => undefined);
  return rows[0]?.id ? String(rows[0].id) : null;
}

export async function recall(input: {
  agentId?: string;
  kind?: MemoryKind;
  correlationId?: string;
  limit?: number;
}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  if (input.correlationId) {
    return sql`
      SELECT id, agent_id, kind, content, metadata, importance, correlation_id, created_at
      FROM agent_memory
      WHERE correlation_id = ${input.correlationId}
      ORDER BY created_at DESC LIMIT ${limit}`;
  }
  if (input.agentId && input.kind) {
    return sql`
      SELECT id, agent_id, kind, content, metadata, importance, correlation_id, created_at
      FROM agent_memory
      WHERE agent_id = ${input.agentId} AND kind = ${input.kind}
      ORDER BY importance DESC, created_at DESC LIMIT ${limit}`;
  }
  if (input.agentId) {
    return sql`
      SELECT id, agent_id, kind, content, metadata, importance, correlation_id, created_at
      FROM agent_memory
      WHERE agent_id = ${input.agentId}
      ORDER BY created_at DESC LIMIT ${limit}`;
  }
  return sql`
    SELECT id, agent_id, kind, content, metadata, importance, correlation_id, created_at
    FROM agent_memory ORDER BY created_at DESC LIMIT ${limit}`;
}
