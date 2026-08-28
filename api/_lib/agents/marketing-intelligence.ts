import { researchSearch } from './research.js';
import { generateWithFallback } from './providers.js';
import type { AgentContext, ModelProvider } from './types.js';

/**
 * Marketing Intelligence — market scout only.
 * Does not publish social content.
 */
export async function scoutMarketing(context: AgentContext, topic?: string) {
  const focus = (topic || 'Nigeria ecommerce product trends accessories phones solar fashion').slice(0, 200);
  const sources = await researchSearch({
    query: `${focus} consumer interest content opportunities retail`,
    maxResults: 5,
  });

  if (!sources.length) {
    return {
      brief: null,
      sources: [],
      note: 'No research sources. Marketing scout cannot invent trends.',
    };
  }

  const evidence = sources.map((s, i) => `${i + 1}. ${s.title}\n${s.url}\n${s.snippet}`).join('\n\n');
  let provider: ModelProvider | undefined;
  let model: string | undefined;
  let text = '';
  try {
    const result = await generateWithFallback(['groq', 'cerebras', 'gemini'], {
      system: `You are Vura Marketing Intelligence (scout only). Do not invent sources. Do not write publishable spam. Return JSON: { trend, whyItMatters, targetCustomer, productOpportunity, contentAngle, whereToGo, whatToLookFor, urgency }.`,
      user: `From sources only:\n${evidence}`,
      temperature: 0.2,
      maxTokens: 1200,
    });
    text = result.text;
    provider = result.provider;
    model = result.model;
  } catch (error) {
    return {
      brief: null,
      sources,
      note: error instanceof Error ? error.message : 'Model unavailable',
    };
  }

  let brief: Record<string, unknown> | null = null;
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) brief = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    brief = null;
  }

  return {
    brief,
    sources,
    provider,
    model,
    policy: 'Human obtains and posts content. Agent does not auto-publish.',
    agentId: context.agentId,
  };
}
