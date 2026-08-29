import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../api/_lib/agents/types.js';

/**
 * Phase A — Trend Intelligence must run its data access through the governed
 * Agent Runtime (executeTool) instead of bypassing the tool registry.
 *
 * Block A: Trend routes web.search + products.search through executeTool.
 * Runtime + providers are mocked so no DB/network is touched; we assert Trend
 * calls executeTool for the two governed tools and preserves behavior.
 */

const mockExec = vi.hoisted(() => vi.fn());
const mockGenerate = vi.hoisted(() => vi.fn());

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
  generate: vi.fn(),
  generateWithImages: vi.fn(),
}));

import { discoverTrends } from '../api/_lib/agents/trend.js';
import type { ResearchResult } from '../api/_lib/agents/research.js';

const trendContext: AgentContext = { agentId: 'trend-intelligence', runId: 'run-0001', task: 'scan' };
const src: ResearchResult[] = [{ provider: 'tavily', title: 'T', url: 'https://example.com/a', snippet: 's' }];

describe('Trend Intelligence routes through governed executeTool', () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockGenerate.mockReset();
  });

  it('invokes web.search through executeTool with the agent runId and categories', async () => {
    mockExec.mockResolvedValueOnce({ results: src }).mockResolvedValueOnce({ products: [] });
    mockGenerate.mockResolvedValue({ text: '[]', provider: 'groq', model: 'm', usage: {} });

    await discoverTrends(trendContext, ['phones']);

    const webCall = mockExec.mock.calls.find((c) => c[2] === 'web.search');
    expect(webCall).toBeDefined();
    expect(webCall![0]).toBe('trend-intelligence');
    expect(webCall![1]).toBe('run-0001');
    expect(webCall![3]).toMatchObject({ maxResults: 5 });
    expect(String((webCall![3] as { query?: string }).query ?? '')).toContain('phones');
  });

  it('invokes products.search through executeTool with the agent runId', async () => {
    mockExec
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ products: [{ name: 'Pixel', brand: 'Google', category: 'phones' }] });

    await discoverTrends(trendContext, ['phones']);

    const productCall = mockExec.mock.calls.find((c) => c[2] === 'products.search');
    expect(productCall).toBeDefined();
    expect(productCall![0]).toBe('trend-intelligence');
    expect(productCall![1]).toBe('run-0001');
  });

  it('preserves soft-failure when no research sources are produced', async () => {
    mockExec.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({ products: [] });

    const result = await discoverTrends(trendContext, ['phones']);

    expect(result.candidates).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(String(result.note ?? '')).toContain('No research providers configured');
  });

  it('keeps existing result shape (sources, candidates, provider, model) on success', async () => {
    mockExec.mockResolvedValueOnce({ results: src }).mockResolvedValueOnce({ products: [] });
    mockGenerate.mockResolvedValue({ text: '[]', provider: 'groq', model: 'm', usage: {} });

    const result = await discoverTrends(trendContext, ['phones']);

    expect(result.sources).toEqual(src);
    expect(result.provider).toBe('groq');
    expect(result.model).toBe('m');
    expect(Array.isArray(result.candidates)).toBe(true);
  });
});
