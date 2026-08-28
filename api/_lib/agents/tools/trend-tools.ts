import type { AgentTool } from '../types.js';
import { discoverTrends } from '../trend.js';
import type { AgentContext } from '../types.js';

/** Collect trend candidates (research + structure). Read/analyze risk. */
export const trendCollectTool: AgentTool = {
  name: 'trend.collect',
  description:
    'Run Trend Intelligence discovery for selected categories. Uses research sources only; never invents evidence. Returns structured candidates with scores and source URLs.',
  risk: 'read',
  async execute(input, context: AgentContext) {
    const categories =
      input && typeof input === 'object' && Array.isArray((input as { categories?: unknown }).categories)
        ? ((input as { categories: unknown[] }).categories.filter((c): c is string => typeof c === 'string') as string[])
        : undefined;
    const result = await discoverTrends(context, categories);
    return {
      candidateCount: result.candidates.length,
      candidates: result.candidates,
      sourceCount: result.sources.length,
      provider: result.provider,
      model: result.model,
      note: (result as { note?: string }).note ?? null,
    };
  },
};

/** Score / rank already-collected candidates (local only). */
export const trendScoreTool: AgentTool = {
  name: 'trend.score',
  description: 'Rank trend candidates by combined trendScore and commercialScore. Input: { candidates: [...] }.',
  risk: 'read',
  async execute(input) {
    const list =
      input && typeof input === 'object' && Array.isArray((input as { candidates?: unknown }).candidates)
        ? ((input as { candidates: Array<Record<string, unknown>> }).candidates)
        : [];
    const ranked = [...list]
      .map((c) => {
        const trend = Number(c.trendScore ?? c.score ?? 0);
        const commercial = Number(c.commercialScore ?? c.score ?? 0);
        const combined = Math.round((trend * 0.55 + commercial * 0.45));
        return { ...c, combinedScore: combined };
      })
      .sort((a, b) => (b.combinedScore as number) - (a.combinedScore as number));
    return { ranked, count: ranked.length };
  },
};
