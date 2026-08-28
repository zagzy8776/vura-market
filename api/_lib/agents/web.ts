import { getOptionalEnvironment } from '../env.js';

export type ResearchProvider = 'tavily' | 'exa' | 'firecrawl' | 'serpapi';

function keyFor(provider: ResearchProvider): string {
  const key = getOptionalEnvironment(
    provider === 'tavily' ? 'TAVILY_API_KEY' :
    provider === 'exa' ? 'EXA_API_KEY' :
    provider === 'firecrawl' ? 'FIRECRAWL_API_KEY' : 'SERPAPI_API_KEY',
  );
  if (!key) throw new Error(`${provider} is not configured`);
  return key;
}

export async function searchWeb(provider: ResearchProvider, query: string) {
  if (!query.trim()) throw new Error('Search query is required');

  if (provider === 'tavily') {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: keyFor(provider), query, search_depth: 'advanced', max_results: 5 }),
    });
    if (!response.ok) throw new Error(`tavily search failed (${response.status})`);
    return response.json();
  }

  if (provider === 'exa') {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST', headers: { Authorization: `Bearer ${keyFor(provider)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, type: 'auto', numResults: 5, contents: { highlights: true } }),
    });
    if (!response.ok) throw new Error(`exa search failed (${response.status})`);
    return response.json();
  }

  if (provider === 'firecrawl') {
    const response = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST', headers: { Authorization: `Bearer ${keyFor(provider)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5 }),
    });
    if (!response.ok) throw new Error(`firecrawl search failed (${response.status})`);
    return response.json();
  }

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', keyFor(provider));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`serpapi search failed (${response.status})`);
  return response.json();
}
