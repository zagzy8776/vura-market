import { discoverTrends } from './trend.js';
import { saveTrendCandidates } from './opportunities.js';
import { createAgentNotification } from './notifications.js';
import type { AgentContext } from './types.js';

export async function runTrendIntelligence(context: AgentContext, categories?: string[]) {
  const result = await discoverTrends(context, categories);
  if (!result.candidates.length) {
    await createAgentNotification({
      title: 'Trend scan completed',
      message: 'The trend scan completed, but there was not enough verified evidence to create an opportunity.',
      severity: 'info', agentId: context.agentId,
      metadata: { runId: context.runId, sources: result.sources.length },
    });
    return { ...result, opportunities: [] };
  }

  const opportunities = await saveTrendCandidates(result.candidates, context.agentId);
  const strong = opportunities.filter((item) => (item.score ?? 0) >= 75);
  if (strong.length) {
    const summary = strong.slice(0, 5).map((item) => `${item.name} (${item.score ?? 'n/a'}/100)`).join(', ');
    await createAgentNotification({
      title: `🔥 ${strong.length} trend opportunit${strong.length === 1 ? 'y' : 'ies'} detected`,
      message: `${summary}. Open Vura Studio to investigate.`,
      severity: strong.some((item) => (item.score ?? 0) >= 90) ? 'warning' : 'info',
      agentId: context.agentId,
      opportunityId: strong[0]?.id,
      metadata: { runId: context.runId, count: strong.length },
    });
  }
  return { ...result, opportunities };
}
