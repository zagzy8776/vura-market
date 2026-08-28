import { randomUUID } from 'crypto';
import { investigateProduct } from './product-intelligence.js';
import { createAgentNotification } from './notifications.js';
import { sql } from '../db.js';
import type { AgentContext } from './types.js';

export async function runProductIntelligence(
  context: AgentContext,
  input: { opportunityId?: string; productName?: string; category?: string },
) {
  const started = Date.now();
  const result = await investigateProduct(context, input);

  try {
    await sql`
      UPDATE agent_runs
      SET status = 'completed', provider = ${result.provider ?? null}, model = ${result.model ?? null}, completed_at = now()
      WHERE id = ${context.runId} AND status = 'running'`;
  } catch {
    /* optional */
  }

  await sql`
    INSERT INTO agent_events (id, run_id, event_type, output)
    VALUES (
      ${randomUUID()},
      ${context.runId},
      'product.investigate',
      ${JSON.stringify({
        hasReport: Boolean(result.report),
        productName: result.report?.productName ?? input.productName ?? null,
        opportunityId: input.opportunityId ?? null,
        confidence: result.report?.confidence ?? null,
        durationMs: Date.now() - started,
        note: result.note ?? null,
      })}::jsonb
    )`.catch(() => undefined);

  if (result.report) {
    await createAgentNotification({
      title: `Product research: ${result.report.productName}`,
      message: `${result.report.recommendation} (confidence ${result.report.confidence}/100). Review in Studio before any listing.`,
      severity: result.report.confidence >= 70 ? 'info' : 'warning',
      agentId: context.agentId,
      opportunityId: input.opportunityId,
      metadata: { runId: context.runId, confidence: result.report.confidence },
    });
  } else {
    await createAgentNotification({
      title: 'Product intelligence incomplete',
      message: result.note || 'Could not produce an evidence-backed product report.',
      severity: 'warning',
      agentId: context.agentId,
      opportunityId: input.opportunityId,
      metadata: { runId: context.runId },
    });
  }

  return {
    agentId: context.agentId,
    runId: context.runId,
    ...result,
    durationMs: Date.now() - started,
  };
}
