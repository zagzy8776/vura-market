import { sql } from '../db.js';

export type AgentNotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export async function createAgentNotification(input: {
  title: string;
  message: string;
  severity?: AgentNotificationSeverity;
  agentId?: string;
  opportunityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const metadata = JSON.stringify(input.metadata ?? {});
  const rows = await sql`
    INSERT INTO agent_notifications (title, message, severity, agent_id, opportunity_id, metadata)
    VALUES (${input.title.slice(0, 200)}, ${input.message.slice(0, 5000)}, ${input.severity ?? 'info'}, ${input.agentId ?? null}, ${input.opportunityId ?? null}, ${metadata}::jsonb)
    RETURNING id, title, message, severity, agent_id, opportunity_id, metadata, created_at
  `;
  return rows[0] ?? null;
}

export async function listAgentNotifications(limit = 50) {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  return sql`
    SELECT id, title, message, severity, agent_id, opportunity_id, metadata, created_at
    FROM agent_notifications ORDER BY created_at DESC LIMIT ${safeLimit}
  `;
}
