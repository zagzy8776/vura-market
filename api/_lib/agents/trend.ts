/**
 * Trend Intelligence Agent — discovery only.
 * Never invents evidence. Structures commercial signals from research sources
 * and optional Vura catalog context. Category-agnostic.
 *
 * Data access is governed: web research and catalog lookups go through the
 * governed Agent Runtime's executeTool() so every tool use is policy-checked
 * and recorded against the owning agent run.
 */
import { generateWithFallback } from './providers.js';
import { executeTool } from './runtime.js';
import type { ResearchResult } from './research.js';
import type { AgentContext, ModelProvider } from './types.js';

export interface TrendCandidate {
  name: string;
  category: string;
  product?: string;
  signal: string;
  evidence: string;
  sources: string[];
  confidence: number;
  trendScore: number;
  commercialScore: number;
  urgency: 'low' | 'medium' | 'high';
  region: string;
  timeWindow: string;
  recommendation: string;
}

const DEFAULT_CATEGORIES = [
  'phones', 'laptops', 'earphones', 'phone accessories', 'gaming',
  'solar panels', 'inverters', 'fashion', 'shoes', 'bags',
  'beverages', 'home appliances', 'cars', 'car accessories',
];

function clampScore(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function extractArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeCandidate(raw: Record<string, unknown>, fallbackSources: string[]): TrendCandidate | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : typeof raw.trend === 'string' ? raw.trend.trim() : '';
  const category = typeof raw.category === 'string' ? raw.category.trim() : '';
  const signal = typeof raw.signal === 'string' ? raw.signal.trim() : '';
  const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim() : '';
  if (!name || !category || !signal || !evidence) return null;

  const sourcesRaw = raw.sources;
  const sources = Array.isArray(sourcesRaw)
    ? sourcesRaw.filter((s): s is string => typeof s === 'string' && s.startsWith('http')).slice(0, 8)
    : fallbackSources.slice(0, 5);
  if (!sources.length) return null; // no invented sources

  const urgencyRaw = typeof raw.urgency === 'string' ? raw.urgency.toLowerCase() : 'medium';
  const urgency = urgencyRaw === 'high' || urgencyRaw === 'low' ? urgencyRaw : 'medium';

  return {
    name: name.slice(0, 300),
    category: category.slice(0, 160),
    product: typeof raw.product === 'string' ? raw.product.trim().slice(0, 300) : name.slice(0, 300),
    signal: signal.slice(0, 1000),
    evidence: evidence.slice(0, 5000),
    sources,
    confidence: clampScore(raw.confidence ?? raw.trendScore ?? 50),
    trendScore: clampScore(raw.trendScore ?? raw.score ?? 50),
    commercialScore: clampScore(raw.commercialScore ?? raw.trendScore ?? 50),
    urgency,
    region: typeof raw.region === 'string' && raw.region.trim() ? raw.region.trim().slice(0, 120) : 'Nigeria',
    timeWindow: typeof raw.timeWindow === 'string' && raw.timeWindow.trim()
      ? raw.timeWindow.trim().slice(0, 120)
      : 'next 30–90 days',
    recommendation: typeof raw.recommendation === 'string' && raw.recommendation.trim()
      ? raw.recommendation.trim().slice(0, 1000)
      : 'Investigate sourcing and pricing before listing.',
  };
}

async function catalogContext(context: AgentContext, categories: string[]): Promise<string> {
  try {
    // Governed read — goes through the registry's products.search tool.
    const result = (await executeTool(context.agentId, context.runId, 'products.search', {})) as {
      products?: Array<{ name?: string; brand?: string; category?: string }>;
    };
    const products = Array.isArray(result?.products) ? result.products : [];
    if (!products.length) return 'Catalog: empty or unavailable.';
    const lines = products.map((r) => `- ${r.brand ? `${r.brand} ` : ''}${r.name ?? ''}${r.category ? ` [${r.category}]` : ''}`);
    return `Current Vura catalog sample (do not invent products beyond this list when referring to "already listed"):\n${lines.join('\n')}\nFocus categories requested: ${categories.join(', ')}`;
  } catch {
    return 'Catalog: unavailable.';
  }
}

/**
 * Discover commercial trends from research sources + catalog context.
 * Returns only candidates with evidence and real source URLs.
 */
export async function discoverTrends(context: AgentContext, categories = DEFAULT_CATEGORIES) {
  const focus = categories.slice(0, 16);
  const query =
    `Nigeria ecommerce and retail product demand trends 2025–2026. ` +
    `Categories of interest: ${focus.join(', ')}. ` +
    `Look for rising search interest, new product launches, price moves, competitor activity, seasonal demand. ` +
    `Prefer signals relevant to Nigerian buyers and West African retail.`;

  // Governed read — runs through the registry's web.search tool.
  const webResult = (await executeTool(context.agentId, context.runId, 'web.search', { query, maxResults: 5 })) as {
    results?: ResearchResult[];
  };
  const sources: ResearchResult[] = Array.isArray(webResult?.results) ? webResult.results : [];
  const sourceUrls = sources.map((s) => s.url).filter(Boolean);
  const evidenceBlock = sources.length
    ? sources
        .map((s, i) => `${i + 1}. [${s.provider}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
        .join('\n\n')
    : 'NO_EXTERNAL_SOURCES_AVAILABLE';

  const catalog = await catalogContext(context, focus);

  const system = [
    `You are Vura Market's Trend Intelligence agent (${context.agentId}).`,
    'You discover commercial opportunities. You do NOT invent evidence, URLs, prices, or demand.',
    'Use ONLY the SOURCES block below. If evidence is thin, return fewer items or an empty array.',
    'Every opportunity MUST include real source URLs copied from the SOURCES list.',
    'Return ONLY a JSON array (no markdown) of objects with keys:',
    'name, category, product, signal, evidence, sources (array of URLs), confidence (0-100),',
    'trendScore (0-100), commercialScore (0-100), urgency (low|medium|high), region, timeWindow, recommendation.',
    'Region default Nigeria. Be category-agnostic (phones, solar, fashion, cars, etc.).',
    '',
    'CATALOG CONTEXT:',
    catalog,
    '',
    'SOURCES:',
    evidenceBlock,
  ].join('\n');

  const user =
    `From the sources only, extract up to 8 high-signal commercial trends for a Nigerian multi-category marketplace. ` +
    `If sources are insufficient, return [].`;

  let text = '';
  let provider: ModelProvider | undefined;
  let model: string | undefined;

  if (sources.length === 0) {
    // Soft path: no research keys — do not invent trends from the model alone
    return {
      text: '',
      provider: undefined,
      model: undefined,
      sources,
      candidates: [] as TrendCandidate[],
      note: 'No research providers configured or all providers failed. Trend scan produced zero evidence-backed opportunities.',
    };
  }

  try {
    const result = await generateWithFallback(['groq', 'cerebras', 'gemini'] as ModelProvider[], {
      system,
      user,
      temperature: 0.15,
      maxTokens: 2500,
    });
    text = result.text;
    provider = result.provider;
    model = result.model;
  } catch (error) {
    return {
      text: '',
      provider: undefined,
      model: undefined,
      sources,
      candidates: [] as TrendCandidate[],
      note: error instanceof Error ? error.message : 'Model providers unavailable',
    };
  }

  const candidates = extractArray(text)
    .map((item) => (item && typeof item === 'object' ? normalizeCandidate(item as Record<string, unknown>, sourceUrls) : null))
    .filter((c): c is TrendCandidate => Boolean(c))
    .slice(0, 8);

  return { text, provider, model, sources, candidates };
}
