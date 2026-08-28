import { getEnvironment } from '../env.js';
import { generateWithFallback } from './providers.js';
import type { AgentContext, ModelProvider } from './types.js';

export type ResearchProvider = 'tavily' | 'exa' | 'firecrawl' | 'serpapi';

export interface ResearchResult {
  provider: ResearchProvider;
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

function keyFor(provider: ResearchProvider) {
  return getEnvironment(provider === 'tavily' ? 'TAVILY_API_KEY' : provider === 'exa' ? 'EXA_API_KEY' : provider === 'firecrawl' ? 'FIRECRAWL_API_KEY' : 'SERPAPI_API_KEY');
}

async function searchTavily(query: string, maxResults: number) {
  const response = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: keyFor('tavily'), query, search_depth: 'basic', max_results: maxResults, include_answer: false }) });
  if (!response.ok) throw new Error(`tavily search failed (${response.status})`);
  const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; score?: number }> };
  return (data.results ?? []).map((item) => ({ provider: 'tavily' as const, title: item.title ?? '', url: item.url ?? '', snippet: item.content ?? '', score: item.score }));
}

async function searchExa(query: string, maxResults: number) {
  const response = await fetch('https://api.exa.ai/search', { method: 'POST', headers: { Authorization: `Bearer ${keyFor('exa')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, type: 'auto', numResults: maxResults, contents: { highlights: { maxCharacters: 800 } } }) });
  if (!response.ok) throw new Error(`exa search failed (${response.status})`);
  const data = await response.json() as { results?: Array<{ title?: string; url?: string; highlights?: string[]; score?: number }> };
  return (data.results ?? []).map((item) => ({ provider: 'exa' as const, title: item.title ?? '', url: item.url ?? '', snippet: (item.highlights ?? []).join(' '), score: item.score }));
}

async function searchFirecrawl(query: string, maxResults: number) {
  const response = await fetch('https://api.firecrawl.dev/v1/search', { method: 'POST', headers: { Authorization: `Bearer ${keyFor('firecrawl')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, limit: maxResults }) });
  if (!response.ok) throw new Error(`firecrawl search failed (${response.status})`);
  const data = await response.json() as { data?: Array<{ title?: string; url?: string; description?: string }> };
  return (data.data ?? []).map((item) => ({ provider: 'firecrawl' as const, title: item.title ?? '', url: item.url ?? '', snippet: item.description ?? '' }));
}

async function searchSerpApi(query: string, maxResults: number) {
  const params = new URLSearchParams({ engine: 'google', q: query, num: String(maxResults), api_key: keyFor('serpapi') });
  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!response.ok) throw new Error(`serpapi search failed (${response.status})`);
  const data = await response.json() as { organic_results?: Array<{ title?: string; link?: string; snippet?: string; position?: number }> };
  return (data.organic_results ?? []).map((item) => ({ provider: 'serpapi' as const, title: item.title ?? '', url: item.link ?? '', snippet: item.snippet ?? '', score: item.position ? 1 / item.position : undefined }));
}

export async function researchSearch(input: { query: string; providers?: ResearchProvider[]; maxResults?: number }) {
  const query = input.query.trim();
  if (query.length < 2 || query.length > 500) throw new Error('Research query must be between 2 and 500 characters.');
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10);
  const providers = input.providers?.length ? input.providers : ['tavily', 'exa', 'firecrawl', 'serpapi'] as ResearchProvider[];
  const searches = await Promise.allSettled(providers.map((provider) => provider === 'tavily' ? searchTavily(query, maxResults) : provider === 'exa' ? searchExa(query, maxResults) : provider === 'firecrawl' ? searchFirecrawl(query, maxResults) : searchSerpApi(query, maxResults)));
  const results: ResearchResult[] = [];
  for (const search of searches) if (search.status === 'fulfilled') results.push(...search.value);
  return results.slice(0, maxResults * providers.length);
}

export async function runResearch(query: string, context: AgentContext, providers?: ResearchProvider[]) {
  const sources = await researchSearch({ query, providers, maxResults: 5 });
  const evidence = sources.map((source, index) => `${index + 1}. ${source.title}\nURL: ${source.url}\n${source.snippet}`).join('\n\n');
  const result = await generateWithFallback(['groq', 'cerebras', 'gemini'] as ModelProvider[], {
    system: `You are Vura's ${context.agentId} research analyst. Use only evidence supplied below. Do not invent facts, URLs, prices, demand, or trends. If evidence is insufficient, say so.\n\nSOURCES:\n${evidence}`,
    user: query,
    temperature: 0.1,
    maxTokens: 1800,
  });
  return { ...result, sources };
}
