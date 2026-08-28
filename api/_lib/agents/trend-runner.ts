import { randomUUID } from 'crypto';
import { discoverTrends } from './trend.js';
import { saveTrendCandidates } from './opportunities.js';
import { createAgentNotification } from './notifications.js';
import { sql } from '../db.js';
import type { AgentContext } from './types.js';

/**
 * Full Trend Intelligence run: research → structure → persist opportunities → notify admin.
 */
export async function runTrendIntelligence(context: AgentContext, categories?: string[]) {
  const started = Date.now();
  const result = await discoverTrends(context, categories);

  // Persist run status if agent_runs row exists for this runId
  try {
    await sql`
      UPDATE agent_runs
      SET status = 'completed',
          provider = ${result.provider ?? null},
          model = ${result.model ?? null},
          completed_at = now()
      WHERE id = ${context.runId} AND status = 'running'`;
  } catch {
    /* optional */
  }

  await sql`
    INSERT INTO agent_events (id, run_id, event_type, output)
    VALUES (
      ${randomUUID()},
      ${context.runId},
      'trend.scan',
      ${JSON.stringify({
        candidateCount: result.candidates.length,
        sourceCount: result.sources.length,
        durationMs: Date.now() - started,
        note: (result as { note?: string }).note ?? null,
      })}::jsonb
    )`.catch(() => undefined);

  if (!result.candidates.length) {
    await createAgentNotification({
      title: 'Trend scan completed',
      message:
        (result as { note?: string }).note ||
        'Scan finished but there was not enough verified evidence to create opportunities. Configure research API keys or retry later.',
      severity: 'info',
      agentId: context.agentId,
      metadata: { runId: context.runId, sources: result.sources.length },
    });
    return {
      agentId: context.agentId,
      runId: context.runId,
      candidates: [],
      opportunities: [],
      sources: result.sources,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - started,
      note: (result as { note?: string }).note,
    };
  }

  const opportunities = await saveTrendCandidates(result.candidates, context.agentId);
  const strong = opportunities.filter((item) => (item.score ?? 0) >= 70);

  if (strong.length) {
    const summary = strong
      .slice(0, 5)
      .map((item) => `${item.name} (${item.score ?? 'n/a'}/100)`)
      .join(', ');
    await createAgentNotification({
      title: `${strong.length} trend opportunit${strong.length === 1 ? 'y' : 'ies'} need review`,
      message: `${summary}. Open Studio → agent opportunities to investigate. Human approval required before listing or campaigns.`,
      severity: strong.some((item) => (item.score ?? 0) >= 85) ? 'warning' : 'info',
      agentId: context.agentId,
      opportunityId: strong[0]?.id,
      metadata: { runId: context.runId, count: strong.length },
    });
  }

  return {
    agentId: context.agentId,
    runId: context.runId,
    candidates: result.candidates,
    opportunities,
    sources: result.sources,
    provider: result.provider,
    model: result.model,
    durationMs: Date.now() - started,
  };
}
