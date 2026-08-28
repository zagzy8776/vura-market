/**
 * Product Intelligence Agent — deep investigation of a commercial opportunity.
 * Category-agnostic. Never invents specifications.
 */
import { researchSearch, type ResearchResult } from './research.js';
import { generateWithFallback } from './providers.js';
import { sql } from '../db.js';
import type { AgentContext, ModelProvider } from './types.js';

export type EvidenceClass = 'SOURCE_CONFIRMED' | 'USER_PROVIDED' | 'INFERRED' | 'UNKNOWN';

export interface ProductIntelligenceReport {
  opportunityId?: string;
  productName: string;
  brand: string | null;
  model: string | null;
  category: string;
  variants: string[];
  specifications: Record<string, { value: string; evidenceClass: EvidenceClass }>;
  marketPriceRange: string | null;
  competitorNotes: string | null;
  demandSignal: string | null;
  availability: string | null;
  supplierSignals: string | null;
  shippingNotes: string | null;
  warranty: string | null;
  counterfeitRisk: string | null;
  marginPotential: string | null;
  customerSegment: string | null;
  commercialRisk: string | null;
  recommendedPriceRange: string | null;
  competitionLevel: string | null;
  confidence: number;
  recommendation: string;
  sources: string[];
  unknowns: string[];
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : fallback;
}

async function loadOpportunity(opportunityId: string) {
  const rows = await sql`
    SELECT id, name, category, signal, evidence, source, score, status
    FROM agent_opportunities WHERE id = ${opportunityId} LIMIT 1`;
  return rows[0] || null;
}

/**
 * Investigate a product / opportunity using research + optional Vura catalog match.
 */
export async function investigateProduct(
  context: AgentContext,
  input: { opportunityId?: string; productName?: string; category?: string },
) {
  let name = (input.productName || '').trim();
  let category = (input.category || '').trim();
  let opportunityContext = '';

  if (input.opportunityId) {
    const op = await loadOpportunity(input.opportunityId);
    if (op) {
      name = name || String(op.name || '');
      category = category || String(op.category || '');
      opportunityContext = `Opportunity: ${op.name}\nCategory: ${op.category}\nSignal: ${op.signal}\nEvidence: ${op.evidence}\nScore: ${op.score}`;
    }
  }

  if (!name) {
    return {
      report: null as ProductIntelligenceReport | null,
      sources: [] as ResearchResult[],
      note: 'productName or opportunityId is required',
    };
  }

  const query =
    `Product research for Nigerian retail marketplace: ${name}` +
    (category ? ` in category ${category}` : '') +
    `. Specs, variants, market prices NGN, competitors, warranty, counterfeit risks, demand.`;

  const sources = await researchSearch({ query, maxResults: 6 });
  const sourceUrls = sources.map((s) => s.url).filter(Boolean);

  let catalogHit: string | null = null;
  try {
    const pattern = `%${name.slice(0, 60)}%`;
    const rows = await sql`
      SELECT p.name, p.brand, p.price_kobo, p.storage, p.color, p.condition_label, c.name AS category
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = true AND (p.name ILIKE ${pattern} OR p.brand ILIKE ${pattern})
      LIMIT 5`;
    if (rows.length) {
      catalogHit = rows
        .map((r) => `${r.brand || ''} ${r.name} | ₦${Number(r.price_kobo || 0) / 100} | ${r.storage || ''} ${r.color || ''} [${r.category || ''}]`)
        .join('\n');
    }
  } catch {
    /* ignore */
  }

  if (!sources.length) {
    return {
      report: null,
      sources,
      note: 'No research sources available. Configure research API keys or provide more context. No invented product report.',
    };
  }

  const evidenceBlock = sources
    .map((s, i) => `${i + 1}. [${s.provider}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
    .join('\n\n');

  const system = [
    `You are Vura Product Intelligence (${context.agentId}).`,
    'Investigate one product opportunity for a multi-category Nigerian marketplace.',
    'Use ONLY the SOURCES (and catalog hits if present). Never invent specs, prices, or brands.',
    'For every specification field, mark evidenceClass as SOURCE_CONFIRMED, INFERRED, or UNKNOWN.',
    'If unknown, use null or UNKNOWN — do not guess.',
    'Return ONLY one JSON object with keys:',
    'productName, brand, model, category, variants (string[]),',
    'specifications (object of field -> { value, evidenceClass }),',
    'marketPriceRange, competitorNotes, demandSignal, availability, supplierSignals,',
    'shippingNotes, warranty, counterfeitRisk, marginPotential, customerSegment, commercialRisk,',
    'recommendedPriceRange, competitionLevel, confidence (0-100), recommendation, unknowns (string[]).',
    '',
    opportunityContext ? `OPPORTUNITY CONTEXT:\n${opportunityContext}` : '',
    catalogHit ? `VURA CATALOG HITS:\n${catalogHit}` : 'VURA CATALOG HITS: none',
    '',
    'SOURCES:',
    evidenceBlock,
  ]
    .filter(Boolean)
    .join('\n');

  let text = '';
  let provider: ModelProvider | undefined;
  let model: string | undefined;
  try {
    const result = await generateWithFallback(['groq', 'cerebras', 'gemini'], {
      system,
      user: `Produce the product intelligence JSON for: ${name}`,
      temperature: 0.1,
      maxTokens: 2800,
    });
    text = result.text;
    provider = result.provider;
    model = result.model;
  } catch (error) {
    return {
      report: null,
      sources,
      note: error instanceof Error ? error.message : 'Model providers unavailable',
      provider,
      model,
    };
  }

  const raw = extractJsonObject(text);
  if (!raw) {
    return {
      report: null,
      sources,
      note: 'Model did not return valid JSON product report',
      provider,
      model,
      rawText: text.slice(0, 2000),
    };
  }

  const specsIn = raw.specifications;
  const specifications: ProductIntelligenceReport['specifications'] = {};
  if (specsIn && typeof specsIn === 'object' && !Array.isArray(specsIn)) {
    for (const [k, v] of Object.entries(specsIn as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const rec = v as Record<string, unknown>;
        const value = str(rec.value) || 'UNKNOWN';
        const ec = str(rec.evidenceClass)?.toUpperCase() as EvidenceClass | undefined;
        const evidenceClass: EvidenceClass =
          ec === 'SOURCE_CONFIRMED' || ec === 'USER_PROVIDED' || ec === 'INFERRED' ? ec : 'UNKNOWN';
        specifications[k] = { value, evidenceClass };
      } else if (typeof v === 'string') {
        specifications[k] = { value: v, evidenceClass: 'UNKNOWN' };
      }
    }
  }

  const variants = Array.isArray(raw.variants)
    ? raw.variants.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 120))
    : [];
  const unknowns = Array.isArray(raw.unknowns)
    ? raw.unknowns.filter((x): x is string => typeof x === 'string')
    : [];

  const report: ProductIntelligenceReport = {
    opportunityId: input.opportunityId,
    productName: str(raw.productName) || name,
    brand: str(raw.brand),
    model: str(raw.model),
    category: str(raw.category) || category || 'UNKNOWN',
    variants,
    specifications,
    marketPriceRange: str(raw.marketPriceRange),
    competitorNotes: str(raw.competitorNotes),
    demandSignal: str(raw.demandSignal),
    availability: str(raw.availability),
    supplierSignals: str(raw.supplierSignals),
    shippingNotes: str(raw.shippingNotes),
    warranty: str(raw.warranty),
    counterfeitRisk: str(raw.counterfeitRisk),
    marginPotential: str(raw.marginPotential),
    customerSegment: str(raw.customerSegment),
    commercialRisk: str(raw.commercialRisk),
    recommendedPriceRange: str(raw.recommendedPriceRange),
    competitionLevel: str(raw.competitionLevel),
    confidence: num(raw.confidence, 40),
    recommendation: str(raw.recommendation) || 'Needs human review before any listing decision.',
    sources: sourceUrls.slice(0, 10),
    unknowns,
  };

  return { report, sources, provider, model };
}
