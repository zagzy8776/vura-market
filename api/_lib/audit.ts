import { sql } from './db.js';

export async function recordAudit({
  actorUserId,
  action,
  entityType,
  entityId,
  beforeData,
  afterData,
  metadata,
}: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: unknown;
}) {
  await sql`
    INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data, metadata)
    VALUES (
      ${actorUserId || null},
      ${action},
      ${entityType},
      ${entityId || null},
      ${beforeData == null ? null : JSON.stringify(beforeData)}::jsonb,
      ${afterData == null ? null : JSON.stringify(afterData)}::jsonb,
      ${metadata == null ? null : JSON.stringify(metadata)}::jsonb
    )
  `;
}

export async function recordOrderEvent({
  actorUserId,
  orderId,
  eventType,
  fromStatus,
  toStatus,
  note,
  metadata,
}: {
  actorUserId?: string | null;
  orderId: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  metadata?: unknown;
}) {
  await sql`
    INSERT INTO order_events (order_id, actor_user_id, event_type, from_status, to_status, note, metadata)
    VALUES (
      ${orderId},
      ${actorUserId || null},
      ${eventType},
      ${fromStatus || null},
      ${toStatus || null},
      ${note || null},
      ${metadata == null ? null : JSON.stringify(metadata)}::jsonb
    )
  `;
}
