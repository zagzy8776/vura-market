import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../api/_lib/agents/types.js';

/**
 * Phase A — Product Intelligence must run its data acquisition through the
 * governed Agent Runtime (executeTool) instead of bypassing the tool registry.
 *
 * Block A: product-intelligence.investigateProduct routes web.search +
 * products.search through executeTool; image-intelligence.analyzeProductImages
 * routes web.search through executeTool. Runtime + providers are mocked so no
 * DB/network is touched.
 */

const mockExec = vi.hoisted(() => vi.fn());
const mockGenerate = vi.hoisted(() => vi.fn());
const mockGenerateImages = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/agents/runtime.js', () => ({
  executeTool: mockExec,
  getAgentPolicy: vi.fn(),
  listTools: vi.fn(),
  registerTool: vi.fn(),
  requestApproval: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock('../api/_lib/agents/providers.js', () => ({
  generateWithFallback: mockGenerate,
  generateWithImages: mockGenerateImages,
  generate: vi.fn(),
}));

vi.mock('../api/_lib/db.js', () => ({
  sql: vi.fn(() => Promise.resolve([])),
}));

import { investigateProduct } from '../api/_lib/agents/product-intelligence.js';
import { analyzeProductImages } from '../api/_lib/agents/image-intelligence.js';
import type { ResearchResult } from '../api/_lib/agents/research.js';

const productContext: AgentContext = { agentId: 'product-intelligence', runId: 'run-9001', task: 'investigate' };
const src: ResearchResult[] = [{ provider: 'tavily', title: 'T', url: 'https://example.com/p', snippet: 's' }];

describe('Product Intelligence routes through governed executeTool', () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockGenerate.mockReset();
    mockGenerateImages.mockReset();
  });

  it('invokes web.search through executeTool with agentId, runId, and product query', async () => {
    mockExec.mockResolvedValueOnce({ results: src }).mockResolvedValueOnce({ products: [] });
    mockGenerate.mockResolvedValue({ text: '{}', provider: 'groq', model: 'm', usage: {} });

    await investigateProduct(productContext, { productName: 'Nokia 3310', category: 'phones' });

    const webCall = mockExec.mock.calls.find((c) => c[2] === 'web.search');
    expect(webCall).toBeDefined();
    expect(webCall![0]).toBe('product-intelligence');
    expect(webCall![1]).toBe('run-9001');
    expect(webCall![3]).toMatchObject({ maxResults: 6 });
    expect(String((webCall![3] as { query?: string }).query ?? '')).toContain('Nokia 3310');
  });

  it('invokes products.search through executeTool with the agent runId and product name', async () => {
    mockExec
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ products: [{ name: 'Nokia 3310', brand: 'Nokia', price_kobo: 1500000, storage: '16GB', color: 'Blue', category: 'phones' }] });

    const result = await investigateProduct(productContext, { productName: 'Nokia 3310' });

    const productCall = mockExec.mock.calls.find((c) => c[2] === 'products.search');
    expect(productCall).toBeDefined();
    expect(productCall![0]).toBe('product-intelligence');
    expect(productCall![1]).toBe('run-9001');
    expect(productCall![3]).toMatchObject({ q: 'Nokia 3310', limit: 5 });
    // report is null here because sources are empty (soft path), but no throw.
    expect(result).toBeDefined();
  });

  it('preserves soft-failure when no research sources are produced', async () => {
    mockExec.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({ products: [] });

    const result = await investigateProduct(productContext, { productName: 'Nokia 3310' });

    expect(result.report).toBeNull();
    expect(result.sources).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(String(result.note ?? '')).toContain('No research sources available');
  });

  it('preserves model output and report shape on success', async () => {
    mockExec
      .mockResolvedValueOnce({ results: src })
      .mockResolvedValueOnce({ products: [] });
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({
        productName: 'Nokia 3310',
        brand: 'Nokia',
        category: 'phones',
        specifications: { battery: { value: '1200mAh', evidenceClass: 'SOURCE_CONFIRMED' } },
        confidence: 72,
        recommendation: 'Review before listing.',
      }),
      provider: 'gemini',
      model: 'gm',
      usage: {},
    });

    const result = await investigateProduct(productContext, { productName: 'Nokia 3310' });

    expect(result.report).not.toBeNull();
    expect(result.report!.productName).toBe('Nokia 3310');
    expect(result.report!.brand).toBe('Nokia');
    expect(result.report!.specifications.battery).toEqual({ value: '1200mAh', evidenceClass: 'SOURCE_CONFIRMED' });
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gm');
  });
});

describe('Image Intelligence routes web.search through executeTool', () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockGenerateImages.mockReset();
  });

  it('invokes web.search through executeTool when a product name hint exists', async () => {
    mockGenerateImages.mockResolvedValue({ text: '{}', provider: 'gemini', model: 'gm' });

    await analyzeProductImages(productContext, {
      imageUrls: ['https://res.cloudinary.com/x/sample.jpg'],
      productNameHint: 'Nokia 3310',
      categoryHint: 'phones',
    });

    const webCall = mockExec.mock.calls.find((c) => c[2] === 'web.search');
    expect(webCall).toBeDefined();
    expect(webCall![0]).toBe('product-intelligence');
    expect(webCall![1]).toBe('run-9001');
    expect(webCall![3]).toMatchObject({ maxResults: 4 });
    expect(String((webCall![3] as { query?: string }).query ?? '')).toContain('Nokia 3310');
  });

  it('skips web.search (no external research) when no name hint is provided', async () => {
    mockGenerateImages.mockResolvedValue({ text: '{}', provider: 'gemini', model: 'gm' });

    await analyzeProductImages(productContext, { imageUrls: ['https://res.cloudinary.com/x/sample.jpg'] });

    expect(mockExec).not.toHaveBeenCalled();
  });
});
