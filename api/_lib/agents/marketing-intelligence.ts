import { generateWithFallback } from './providers.js';
import { executeTool } from './runtime.js';
import { runAgentToolLoop } from './tool-loop.js';
import type { ResearchResult } from './research.js';
import type { AgentContext, ChatMessage, ModelProvider } from './types.js';

const DEFAULT_FOCUS = 'Nigeria ecommerce product trends accessories phones solar fashion';
const MARKETING_SYSTEM =
  'You are Vura Marketing Intelligence (scout only). Do not invent sources. Do not write publishable spam. ' +
  'Use web.search to gather current evidence, then return JSON: { trend, whyItMatters, targetCustomer, productOpportunity, contentAngle, whereToGo, whatToLookFor, urgency }.';
const MARKETING_POLICY = 'Human obtains and posts content. Agent does not auto-publish.';
const MARKETING_MAX_TURNS = 4;

function parseBrief(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Collect evidence sources from the tool-result messages produced by the loop. */
function extractSources(messages: ChatMessage[]): ResearchResult[] {
  const sources: ResearchResult[] = [];
  for (const m of messages) {
    if (m.role === 'tool' && m.toolResult?.ok && m.toolResult.output) {
      const output = m.toolResult.output as { results?: ResearchResult[] };
      if (Array.isArray(output.results)) sources.push(...output.results);
    }
  }
  return sources;
}

/**
 * Old single-shot governed path, kept verbatim as a fallback when the tool
 * loop cannot produce a valid result. Research still runs through executeTool;
 * the model call is a plain generateWithFallback.
 */
async function marketingSingleShot(context: AgentContext, focus: string) {
  const webResult = (await executeTool(context.agentId, context.runId, 'web.search', {
    query: `${focus} consumer interest content opportunities retail`,
    maxResults: 5,
  })) as { results?: ResearchResult[] };
  const sources: ResearchResult[] = Array.isArray(webResult?.results) ? webResult.results : [];

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
      system: MARKETING_SYSTEM,
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

  const brief = parseBrief(text);
  return {
    brief,
    sources,
    provider,
    model,
    policy: MARKETING_POLICY,
    agentId: context.agentId,
  };
}

/**
 * Marketing Intelligence — market scout only. Does not publish social content.
 *
 * Primary path is the governed multi-turn tool loop: the MODEL chooses which
 * policy-allowed tool to call (web.search), and EVERY call runs through
 * executeTool(), so research is governed and audited against the owning run.
 * If the loop cannot produce a valid brief, we fall back to the old single-shot
 * governed path so existing behavior is never lost.
 */
export async function scoutMarketing(context: AgentContext, topic?: string) {
  const focus = (topic || DEFAULT_FOCUS).slice(0, 200);

  try {
    const loop = await runAgentToolLoop(context, {
      system: MARKETING_SYSTEM,
      task: `Research the following area using the web and return a JSON marketing brief. Base it only on evidence gathered:\n${focus}`,
      maxTurns: MARKETING_MAX_TURNS,
    });
    const sources = extractSources(loop.messages);
    if (loop.stoppedReason === 'final' && loop.text.trim()) {
      const brief = parseBrief(loop.text);
      if (brief) {
        return {
          brief,
          sources,
          provider: loop.provider,
          model: loop.model,
          policy: MARKETING_POLICY,
          agentId: context.agentId,
        };
      }
    }
  } catch {
    /* fall through to single-shot fallback */
  }

  return marketingSingleShot(context, focus);
}
