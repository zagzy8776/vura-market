import { runResearch } from './research.js';
import type { AgentContext } from './types.js';

export interface TrendCandidate {
  name: string;
  category: string;
  signal: string;
  source?: string;
  evidence?: string;
  score?: number;
}

const CATEGORY_SEEDS = [
  'phones', 'laptops', 'earphones', 'phone accessories', 'gaming',
  'solar panels', 'inverters', 'fashion', 'shoes', 'bags',
  'beverages', 'home appliances', 'cars', 'car accessories',
];

function extractJson(text: string): TrendCandidate[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TrendCandidate => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return typeof value.name === 'string' && typeof value.category === 'string' && typeof value.signal === 'string';
    });
  } catch {
    return [];
  }
}

export async function discoverTrends(context: AgentContext, categories = CATEGORY_SEEDS) {
  const query = `Nigeria ecommerce product trends. Categories: ${categories.join(', ')}. Find products with rising demand, new launches, unusual search interest, or strong buying intent. Return ONLY JSON array with objects containing name, category, signal, source, evidence, score (0-100). Do not invent evidence.`;
  const result = await runResearch(query, context);
  const candidates = extractJson(result.text);
  return { ...result, candidates };
}
