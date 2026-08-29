import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../api/_lib/agents/types.js';

const mockGenerate = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());
const mockListTools = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/agents/providers.js', () => ({
  generateWithFallback: mockGenerate,
  generate: vi.fn(),
  generateWithImages: vi.fn(),
}));

vi.mock('../api/_lib/agents/runtime.js', () => ({
  executeTool: mockExec,
  listTools: mockListTools,
  getAgentPolicy: vi.fn(),
  registerTool: vi.fn(),
  requestApproval: vi.fn(),
  runAgent: vi.fn(),
}));

import { runAgentToolLoop, buildToolDefinitions } from '../api/_lib/agents/tool-loop.js';

const context: AgentContext = { agentId: 'marketing-intelligence', runId: 'run-777', task: 'analyze market' };

function finalText(text: string) {
  return { provider: 'groq' as const, model: 'm', text, toolCalls: [] };
}
function call(name: string, args: Record<string, unknown>) {
  return { provider: 'groq' as const, model: 'm', text: '', toolCalls: [{ id: `c-${name}`, name, arguments: args }] };
}

describe('runAgentToolLoop', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockExec.mockReset();
    mockListTools.mockReset();
    mockListTools.mockReturnValue([
      { name: 'web.search', description: 'Search the web.', risk: 'read', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'products.search', description: 'Search products.', risk: 'read', parameters: { type: 'object', properties: { q: { type: 'string' } } } },
    ]);
  });

  it('exposes only policy-safe (read) tools to the model', () => {
    const defs = buildToolDefinitions(context);
    const names = defs.map((d) => d.name);
    expect(names).toContain('web.search');
    // A write tool is never offered to the model.
    expect(names).not.toContain('inventory.update');
  });

  it('runs a single tool call through executeTool then returns the final text', async () => {
    mockGenerate.mockResolvedValueOnce(call('web.search', { query: 'solar' }));
    mockGenerate.mockResolvedValueOnce(finalText('Here is the analysis.'));
    mockExec.mockResolvedValue({ results: [{ url: 'https://example.com' }], source: 'test' });

    const result = await runAgentToolLoop(context, { task: 'find solar products', system: 'be concise' });

    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledWith('marketing-intelligence', 'run-777', 'web.search', { query: 'solar' });
    expect(result.stoppedReason).toBe('final');
    expect(result.text).toBe('Here is the analysis.');
    expect(result.turns).toBe(2);
    // The tool result must be appended to history so the model sees it.
    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.toolResult?.ok).toBe(true);
  });

  it('supports multiple distinct tools across turns, each independently governed', async () => {
    mockGenerate.mockResolvedValueOnce(call('web.search', { query: 'solar' }));
    mockGenerate.mockResolvedValueOnce(call('products.search', { q: 'solar panel' }));
    mockGenerate.mockResolvedValueOnce(finalText('Done.'));
    mockExec.mockImplementation(async (_a: string, _r: string, name: string) => ({ tool: name, ok: true }));

    const result = await runAgentToolLoop(context, { task: 'research then list' });

    expect(mockExec).toHaveBeenCalledTimes(2);
    expect(mockExec).toHaveBeenNthCalledWith(1, 'marketing-intelligence', 'run-777', 'web.search', { query: 'solar' });
    expect(mockExec).toHaveBeenNthCalledWith(2, 'marketing-intelligence', 'run-777', 'products.search', { q: 'solar panel' });
    expect(result.stoppedReason).toBe('final');
    expect(result.turns).toBe(3);
  });

  it('never executes an unknown or write tool the model requests', async () => {
    mockGenerate.mockResolvedValueOnce(call('inventory.update', { productId: 'p1' }));
    mockGenerate.mockResolvedValueOnce(finalText('Cannot update without approval.'));
    mockExec.mockResolvedValue({ ok: true });

    const result = await runAgentToolLoop(context, { task: 'try to write' });

    // The write tool was NOT offered and must NOT reach executeTool.
    expect(mockExec).not.toHaveBeenCalledWith('marketing-intelligence', 'run-777', 'inventory.update', expect.anything());
    expect(mockExec).toHaveBeenCalledTimes(0);
    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.toolResult?.ok).toBe(false);
  });

  it('returns a failed/unauthorized executeTool rejection to the model as a structured error (nothing runs)', async () => {
    mockGenerate.mockResolvedValueOnce(call('web.search', { query: 'solar' }));
    mockGenerate.mockResolvedValueOnce(finalText('The tool is unavailable.'));
    mockExec.mockRejectedValueOnce(new Error('Approval required for write tool: web.search'));

    const result = await runAgentToolLoop(context, { task: 'go' });

    expect(mockExec).toHaveBeenCalledWith('marketing-intelligence', 'run-777', 'web.search', { query: 'solar' });
    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.toolResult?.ok).toBe(false);
    expect(toolMsg?.toolResult?.error).toContain('Approval required');
    // Loop continues to let the model respond to the error.
    expect(result.stoppedReason).toBe('final');
  });

  it('stops at the hard maximum turn count (no infinite loop)', async () => {
    mockGenerate
      .mockResolvedValueOnce(call('web.search', { query: 'a' }))
      .mockResolvedValueOnce(call('web.search', { query: 'b' }))
      .mockResolvedValueOnce(call('web.search', { query: 'c' }));
    mockExec.mockResolvedValue({ ok: true });

    const result = await runAgentToolLoop(context, { task: 'never finishes', maxTurns: 3 });

    expect(result.stoppedReason).toBe('max_turns');
    expect(result.turns).toBe(3);
    expect(mockExec).toHaveBeenCalledTimes(3);
  });

  it('detects repeated identical tool calls and stops (loop guard)', async () => {
    mockGenerate.mockResolvedValue(call('web.search', { query: 'solar' }));
    mockExec.mockResolvedValue({ ok: true });

    const result = await runAgentToolLoop(context, { task: 'loop detector' });

    expect(result.stoppedReason).toBe('repeated_calls');
  });

  it('returns empty_response when the model emits nothing and requests no tools', async () => {
    mockGenerate.mockResolvedValueOnce({ provider: 'groq', model: 'm', text: '', toolCalls: [] });
    const result = await runAgentToolLoop(context, { task: 'silent model' });
    expect(result.stoppedReason).toBe('empty_response');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('accumulates model usage across turns for the run', async () => {
    mockGenerate
      .mockResolvedValueOnce({ provider: 'groq', model: 'm', text: '', toolCalls: [{ id: 'c1', name: 'web.search', arguments: {} }], usage: { inputTokens: 100, outputTokens: 20 } })
      .mockResolvedValueOnce({ provider: 'groq', model: 'm', text: 'done', toolCalls: [], usage: { inputTokens: 40, outputTokens: 5 } });
    mockExec.mockResolvedValue({ ok: true });

    const result = await runAgentToolLoop(context, { task: 'usage' });

    expect(result.usage.inputTokens).toBe(140);
    expect(result.usage.outputTokens).toBe(25);
  });
});
