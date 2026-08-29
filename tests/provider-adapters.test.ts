import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatMessage, ToolDefinition } from '../api/_lib/agents/types.js';

const sqlMock = vi.hoisted(() => vi.fn());

vi.mock('../api/_lib/db.js', () => ({ sql: sqlMock }));

import {
  generate,
  serializeOpenAiMessages,
  parseOpenAiResponse,
  serializeGeminiContents,
  parseGeminiResponse,
  type OpenAiResponse,
  type GeminiResponse,
} from '../api/_lib/agents/providers.js';

process.env.GROQ_API_KEY = 'test-groq';
process.env.CEREBRAS_API_KEY = 'test-cerebras';
process.env.GEMINI_API_KEY = 'test-gemini';

const webDef: ToolDefinition = {
  name: 'web.search',
  description: 'Search the web.',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
};

const messages: ChatMessage[] = [
  { role: 'user', content: 'Find solar products' },
  { role: 'assistant', toolCalls: [{ id: 'c1', name: 'web.search', arguments: { query: 'solar' } }] },
  { role: 'tool', toolCallId: 'c1', toolResult: { ok: true, output: { results: [] } } },
  { role: 'user', content: 'Summarize' },
];

describe('OpenAI-compatible adapter (Groq/Cerebras)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sqlMock.mockReset().mockResolvedValue([]);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes tool-result continuation messages (assistant tool_calls + tool result)', () => {
    const out = serializeOpenAiMessages(messages);
    const assistant = out.find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
    expect((assistant as { tool_calls: unknown[] }).tool_calls).toHaveLength(1);
    expect((assistant as { tool_calls: Array<{ function: { name: string } }> }).tool_calls[0].function.name).toBe('web.search');
    const toolMsg = out.find((m) => m.role === 'tool');
    expect(toolMsg).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
  });

  it('serializes an ERROR tool result back to the model as structured text', () => {
    const out = serializeOpenAiMessages([
      { role: 'assistant', toolCalls: [{ id: 'c2', name: 'web.search', arguments: {} }] },
      { role: 'tool', toolCallId: 'c2', toolResult: { ok: false, error: 'Approval required' } },
    ]);
    expect(String((out.find((m) => m.role === 'tool') as { content: string }).content)).toContain('TOOL_ERROR');
    expect(String((out.find((m) => m.role === 'tool') as { content: string }).content)).toContain('Approval required');
  });

  it('parses returned tool calls from an OpenAI-compatible response', () => {
    const fixture: OpenAiResponse = {
      choices: [{ message: { content: '', tool_calls: [{ id: 'c3', function: { name: 'web.search', arguments: '{"query":"solar"}' } }] }, finish_reason: 'tool_calls' }],
    };
    const parsed = parseOpenAiResponse(fixture);
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls![0]).toMatchObject({ id: 'c3', name: 'web.search', arguments: { query: 'solar' } });
  });

  it('sends tool definitions and tool_choice, and tolerates malformed tool arguments', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '', tool_calls: [{ id: 'c4', function: { name: 'web.search', arguments: 'not-json' } }] } }],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      }),
    });
    const res = await generate('groq', { user: 'hi', tools: [webDef], toolChoice: 'auto' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]!.body)) as { tools: Array<{ function: { name: string; parameters: unknown } }>; tool_choice: string };
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].function.name).toBe('web.search');
    expect(body.tool_choice).toBe('auto');
    expect(res.toolCalls?.[0].arguments).toEqual({});
  });
});

describe('Gemini adapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sqlMock.mockReset().mockResolvedValue([]);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes Gemini contents with model functionCall and user functionResponse turns', () => {
    const contents = serializeGeminiContents(messages);
    const model = contents.find((c) => c.role === 'model');
    expect(model).toBeDefined();
    const callPart = ((model as { parts: Array<{ functionCall: unknown }> }).parts[0]);
    expect(callPart.functionCall).toMatchObject({ name: 'web.search' });
    const userResp = contents.find((c) => c.role === 'user' && (c.parts as Array<{ functionResponse: unknown }>)[0]?.functionResponse);
    expect(userResp).toBeDefined();
    expect((userResp as { parts: Array<{ functionResponse: { response: { ok: boolean } } }> }).parts[0].functionResponse.response.ok).toBe(true);
  });

  it('parses functionCall responses into normalized ToolCall objects', () => {
    const fixture: GeminiResponse = {
      candidates: [{ content: { parts: [{ functionCall: { name: 'web.search', args: { query: 'solar' } } }] }, finishReason: 'STOP' }],
    };
    const parsed = parseGeminiResponse(fixture);
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls![0]).toMatchObject({ name: 'web.search', arguments: { query: 'solar' } });
  });

  it('sends functionDeclarations and toolConfig, and returns text + tool calls', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: 'web.search', args: { query: 'x' } } }] } }] }),
    });
    const res = await generate('gemini', { user: 'hi', tools: [webDef], toolChoice: 'none' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]!.body)) as {
      tools: Array<{ functionDeclarations: Array<{ name: string }> }>;
      toolConfig: { functionCallingConfig: { mode: string } };
    };
    expect(body.tools[0].functionDeclarations[0].name).toBe('web.search');
    expect(body.toolConfig.functionCallingConfig.mode).toBe('NONE');
    expect(res.toolCalls?.[0]).toMatchObject({ name: 'web.search', arguments: { query: 'x' } });
  });

  it('throws when a tool-only response has no text AND no tool calls', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [{ content: { parts: [] } }] }) });
    await expect(generate('gemini', { user: 'hi', tools: [webDef] })).rejects.toThrow();
  });
});
