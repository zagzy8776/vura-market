import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../api/_lib/agents/types.js';

/**
 * Marketing Intelligence governance — now driven by the governed multi-turn
 * tool loop (runAgentToolLoop): the MODEL chooses which policy-allowed tool to
 * call, and EVERY tool call goes through executeTool(). Runtime + providers are
 * mocked so no DB/network is touched. We assert governance (agentId/runId on
 * executeTool), soft-failure fallback, and that the brief output shape is
 * preserved.
 */

const mockExec = vi.hoisted(() => vi.fn());
const mockGenerate = vi.hoisted(() => vi.fn());
const mockListTools = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/agents/runtime.js', () => ({
  executeTool: mockExec,
  getAgentPolicy: vi.fn(),
  listTools: mockListTools,
  registerTool: vi.fn(),
  requestApproval: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock('../api/_lib/agents/providers.js', () => ({
  generateWithFallback: mockGenerate,
  generate: vi.fn(),
  generateWithImages: vi.fn(),
}));

import { scoutMarketing } from '../api/_lib/agents/marketing-intelligence.js';
import type { ResearchResult } from '../api/_lib/agents/research.js';

const marketingContext: AgentContext = { agentId: 'marketing-intelligence', runId: 'run-7001', task: 'scout' };
const src: ResearchResult[] = [{ provider: 'tavily', title: 'T', url: 'https://example.com/m', snippet: 's' }];

// Marketing policy allows ONLY these read tools; nothing else is ever offered.
const policyTools = [
  { name: 'web.search', description: 'Search the web.', risk: 'read', parameters: { type: 'object' as const, properties: { query: { type: 'string' as const } } } },
  { name: 'products.search', description: 'Search products.', risk: 'read', parameters: { type: 'object' as const, properties: {} } },
  { name: 'product.inspect', description: 'Inspect product.', risk: 'read', parameters: { type: 'object' as const, properties: {} } },
  { name: 'analytics.read', description: 'Read analytics.', risk: 'read', parameters: { type: 'object' as const, properties: {} } },
];

function toolCall(name: string, args: Record<string, unknown>) {
  return { provider: 'groq' as const, model: 'm', text: '', toolCalls: [{ id: `c-${name}`, name, arguments: args }] };
}
function finalJson(brief: Record<string, unknown>) {
  return { provider: 'gemini' as const, model: 'gm', text: JSON.stringify(brief), toolCalls: [] };
}
function finalText(text: string) {
  return { provider: 'groq' as const, model: 'm', text, toolCalls: [] };
}

describe('Marketing Intelligence routes through the governed tool loop', () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockGenerate.mockReset();
    mockListTools.mockReset();
    mockListTools.mockReturnValue(policyTools);
  });

  it('starts the tool loop; the model-requested web.search runs through executeTool with agentId and runId', async () => {
    mockGenerate.mockResolvedValueOnce(toolCall('web.search', { query: 'consumer electronics trends' }));
    mockGenerate.mockResolvedValueOnce(finalJson({ trend: 'Solar adoption', urgency: 'high' }));
    mockExec.mockResolvedValue({ results: src, source: 'test' });

    const result = await scoutMarketing(marketingContext, 'consumer electronics');

    // The topic reaches the model as the first user message of the loop.
    const firstReq = mockGenerate.mock.calls[0][1] as { messages?: Array<{ content?: string }> };
    expect(String(firstReq.messages?.[0]?.content ?? '')).toContain('consumer electronics');

    // Governance: the model-requested web.search runs through executeTool with agentId + runId.
    const webCall = mockExec.mock.calls.find((c) => c[2] === 'web.search');
    expect(webCall).toBeDefined();
    expect(webCall![0]).toBe('marketing-intelligence');
    expect(webCall![1]).toBe('run-7001');
    expect(result.brief).toEqual({ trend: 'Solar adoption', urgency: 'high' });
  });

  it('returns the model-requested web.search result to the model and preserves the brief output shape', async () => {
    mockGenerate.mockResolvedValueOnce(toolCall('web.search', { query: 'solar' }));
    mockGenerate.mockResolvedValueOnce(finalJson({ trend: 'Solar adoption', urgency: 'high' }));
    mockExec.mockResolvedValue({ results: src, source: 'test' });

    const result = await scoutMarketing(marketingContext, 'solar');

    expect(result.brief).toEqual({ trend: 'Solar adoption', urgency: 'high' });
    expect(result.sources).toEqual(src);
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gm');
    expect(result.policy).toContain('does not auto-publish');
    expect(result.agentId).toBe('marketing-intelligence');
  });

  it('soft-fails (brief null) when the loop yields no evidence, preserving the existing contract', async () => {
    // Loop: model requests web.search but the governed tool returns no sources;
    // final turn returns text that does not parse as a brief -> fallback single-shot
    // sees no sources and returns the soft-failure shape without inventing a brief.
    mockGenerate
      .mockResolvedValueOnce(toolCall('web.search', { query: 'phones' }))
      .mockResolvedValueOnce(finalText('No strong signal to report.'));
    mockExec.mockResolvedValue({ results: [], source: 'test' });

    const result = await scoutMarketing(marketingContext, 'phones');

    expect(result.brief).toBeNull();
    expect(result.sources).toEqual([]);
    expect(String(result.note ?? '')).toContain('No research sources');
  });

  it('never executes a tool that is not in the Marketing policy', async () => {
    // The model attempts orders.read — NOT allowed for marketing-intelligence.
    mockGenerate
      .mockResolvedValueOnce(toolCall('orders.read', {}))
      .mockResolvedValueOnce(finalJson({ trend: 'x', urgency: 'low' }));
    mockExec.mockResolvedValue({ results: src });

    await scoutMarketing(marketingContext, 'anything');

    expect(mockExec).not.toHaveBeenCalledWith('marketing-intelligence', 'run-7001', 'orders.read', expect.anything());
  });

  it('never auto-executes a write tool the model requests', async () => {
    mockGenerate
      .mockResolvedValueOnce(toolCall('inventory.update', { productId: 'p1' }))
      .mockResolvedValueOnce(finalJson({ trend: 'x', urgency: 'low' }));
    mockExec.mockResolvedValue({ results: src });

    await scoutMarketing(marketingContext, 'anything');

    expect(mockExec).not.toHaveBeenCalledWith('marketing-intelligence', 'run-7001', 'inventory.update', expect.anything());
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('terminates safely under a bounded turn count (no infinite loop)', async () => {
    // Model keeps requesting web.search; once the loop maxes out it falls back
    // to the single-shot path and still returns a result.
    mockExec.mockResolvedValue({ results: src, source: 'test' });
    mockGenerate
      .mockResolvedValueOnce(toolCall('web.search', { query: 'a' }))
      .mockResolvedValueOnce(toolCall('web.search', { query: 'b' }))
      .mockResolvedValueOnce(toolCall('web.search', { query: 'c' }))
      .mockResolvedValueOnce(toolCall('web.search', { query: 'd' }))
      .mockResolvedValueOnce(finalJson({ trend: 'final', urgency: 'medium' }));

    const result = await scoutMarketing(marketingContext, 'loop');

    // Loop used 4 turns (bounded), then the final (5th) generation produced the brief.
    expectResultShape(result);
    expect(result.brief).toEqual({ trend: 'final', urgency: 'medium' });
  });

  it('falls back to the old single-shot governed path when the loop throws', async () => {
    // The loop's first model call fails; the fallback single-shot recovers and
    // still returns the brief (old behavior preserved).
    mockGenerate
      .mockRejectedValueOnce(new Error('loop exploded'))
      .mockResolvedValueOnce(finalJson({ trend: 'recovered', urgency: 'low' }));
    mockExec.mockResolvedValue({ results: src, source: 'test' });

    const result = await scoutMarketing(marketingContext, 'fallback');

    expect(result.brief).toEqual({ trend: 'recovered', urgency: 'low' });
    expect(result.sources).toEqual(src);
  });
});

function expectResultShape(r: unknown) {
  const o = r as { brief?: unknown; sources?: unknown; provider?: unknown; model?: unknown; agentId?: unknown };
  expect(o).toHaveProperty('brief');
  expect(o).toHaveProperty('sources');
  expect(o).toHaveProperty('agentId', 'marketing-intelligence');
}
