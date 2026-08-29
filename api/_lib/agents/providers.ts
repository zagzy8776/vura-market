import { getOptionalEnvironment } from '../env.js';
import { sql } from '../db.js';
import type { ChatMessage, ModelProvider, ModelRequest, ModelResponse, ToolCall, ToolResult, ToolDefinition } from './types.js';

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  // Free-tier accounts only see a subset — these IDs match current Groq/Cerebras/Gemini free inventories
  groq: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
  cerebras: process.env.CEREBRAS_MODEL || 'gemma-4-31b',
  gemini: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
};

const ENDPOINTS: Record<ModelProvider, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
};

function keyFor(provider: ModelProvider): string | null {
  return getOptionalEnvironment(
    provider === 'groq' ? 'GROQ_API_KEY' : provider === 'cerebras' ? 'CEREBRAS_API_KEY' : 'GEMINI_API_KEY',
  );
}

function requireKey(provider: ModelProvider): string {
  const key = keyFor(provider);
  if (!key) throw new Error(`${provider} is not configured`);
  return key;
}

/** Map a normalized ToolDefinition to an OpenAI-compatible tool object. */
function toOpenAiTool(tool: ToolDefinition) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? { type: 'object', properties: {} },
    },
  };
}

/** Serialize normalized messages to an OpenAI-compatible role/name/content array. */
export function serializeOpenAiMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.role === 'system') {
      out.push({ role: 'system', content: m.content });
    } else if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const msg: Record<string, unknown> = { role: 'assistant', content: m.content || null };
      if (m.toolCalls && m.toolCalls.length) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
        }));
      }
      out.push(msg);
    } else if (m.role === 'tool') {
      const res: ToolResult | undefined = m.toolResult;
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: res
          ? res.ok
            ? typeof res.output === 'string'
              ? res.output
              : JSON.stringify(res.output)
            : `TOOL_ERROR: ${res.error ?? 'unknown tool error'}`
          : 'ok',
      });
    }
  }
  return out;
}

function buildOpenAiMessages(request: ModelRequest): Array<Record<string, unknown>> {
  if (request.messages && request.messages.length) {
    const msgs = serializeOpenAiMessages(request.messages);
    if (request.system) msgs.unshift({ role: 'system', content: request.system });
    return msgs;
  }
  const messages: Array<Record<string, unknown>> = [];
  if (request.system) messages.push({ role: 'system', content: request.system });
  messages.push({ role: 'user', content: request.user });
  return messages;
}

export interface OpenAiChoice {
  message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
  finish_reason?: string;
}
export interface OpenAiResponse {
  choices?: OpenAiChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function parseOpenAiResponse(data: OpenAiResponse): Pick<ModelResponse, 'text' | 'toolCalls' | 'finishReason'> {
  const choice = data.choices?.[0]?.message;
  const toolCalls: ToolCall[] = (choice?.tool_calls ?? []).map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = tc.function?.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
    } catch {
      args = {};
    }
    return { id: tc.id ?? `call_${Math.random().toString(36).slice(2, 8)}`, name: tc.function?.name ?? '', arguments: args };
  });
  return {
    text: (choice?.content ?? '') || '',
    toolCalls,
    finishReason: data.choices?.[0]?.finish_reason,
  };
}

async function openAiCompatible(provider: ModelProvider, request: ModelRequest): Promise<ModelResponse> {
  const body: Record<string, unknown> = {
    model: DEFAULT_MODELS[provider],
    messages: buildOpenAiMessages(request),
    temperature: request.temperature ?? 0.2,
    max_tokens: request.maxTokens ?? 1200,
  };
  if (request.tools && request.tools.length) {
    body.tools = request.tools.map(toOpenAiTool);
    if (request.toolChoice) body.tool_choice = request.toolChoice === 'none' ? 'none' : 'auto';
  }
  const response = await fetch(ENDPOINTS[provider], {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireKey(provider)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${provider} model request failed (${response.status})`);
  const data = await response.json() as OpenAiResponse;
  const parsed = parseOpenAiResponse(data);
  if (!parsed.text && (!parsed.toolCalls || !parsed.toolCalls.length)) throw new Error(`${provider} returned no model output`);
  return {
    provider,
    model: DEFAULT_MODELS[provider],
    text: parsed.text,
    toolCalls: parsed.toolCalls,
    finishReason: parsed.finishReason,
    usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens },
  };
}

/** Map a normalized ToolDefinition to a Gemini functionDeclaration. */
function toGeminiFunctionDeclaration(tool: ToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters ?? { type: 'object', properties: {} },
  };
}

/** Serialize normalized messages to Gemini contents (roles: user/model, tool results as functionResponse parts). */
export function serializeGeminiContents(messages: ChatMessage[]): Array<Record<string, unknown>> {
  const contents: Array<Record<string, unknown>> = [];
  // Map of toolCallId -> tool name from the most recent assistant turn.
  const names = new Map<string, string>();
  for (const m of messages) {
    if (m.role === 'system') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant') {
      if (m.toolCalls && m.toolCalls.length) {
        for (const tc of m.toolCalls) names.set(tc.id, tc.name);
        const callParts: Array<Record<string, unknown>> = m.toolCalls.map((tc) => ({
          functionCall: { name: tc.name, args: tc.arguments ?? {} },
        }));
        if (m.content) callParts.unshift({ text: m.content });
        contents.push({ role: 'model', parts: callParts });
      } else {
        contents.push({ role: 'model', parts: [{ text: m.content }] });
      }
    } else if (m.role === 'tool') {
      const res = m.toolResult;
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.toolCallId ? names.get(m.toolCallId) : undefined,
              response: res
                ? res.ok
                  ? { result: res.output, ok: true }
                  : { error: res.error ?? 'unknown tool error', ok: false }
                : { result: 'ok', ok: true },
            },
          },
        ],
      });
    }
  }
  return contents;
}

function buildGeminiContents(request: ModelRequest) {
  if (request.messages && request.messages.length) return serializeGeminiContents(request.messages);
  return [{ role: 'user', parts: [{ text: request.user }] }];
}

export interface GeminiPart {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
}
export interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export function parseGeminiResponse(data: GeminiResponse): Pick<ModelResponse, 'text' | 'toolCalls' | 'finishReason'> {
  const content = data.candidates?.[0]?.content;
  const pieces: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const part of content?.parts ?? []) {
    if (typeof part.text === 'string' && part.text) pieces.push(part.text);
    if (part.functionCall?.name) {
      toolCalls.push({
        id: `${part.functionCall.name}:${Math.random().toString(36).slice(2, 8)}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args ?? {},
      });
    }
  }
  return {
    text: pieces.join('').trim(),
    toolCalls,
    finishReason: data.candidates?.[0]?.finishReason,
  };
}

async function gemini(request: ModelRequest): Promise<ModelResponse> {
  const model = DEFAULT_MODELS.gemini;
  const body: Record<string, unknown> = {
    systemInstruction: request.system ? { parts: [{ text: request.system }] } : undefined,
    contents: buildGeminiContents(request),
    generationConfig: { temperature: request.temperature ?? 0.2, maxOutputTokens: request.maxTokens ?? 1200 },
  };
  if (request.tools && request.tools.length) {
    body.tools = [{ functionDeclarations: request.tools.map(toGeminiFunctionDeclaration) }];
    if (request.toolChoice) {
      body.toolConfig = { functionCallingConfig: { mode: request.toolChoice === 'none' ? 'NONE' : 'AUTO' } };
    }
  }
  const response = await fetch(`${ENDPOINTS.gemini}/${model}:generateContent?key=${encodeURIComponent(requireKey('gemini'))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`gemini model request failed (${response.status})`);
  const data = await response.json() as GeminiResponse;
  const parsed = parseGeminiResponse(data);
  if (!parsed.text && (!parsed.toolCalls || !parsed.toolCalls.length)) throw new Error('gemini returned no model output');
  return {
    provider: 'gemini',
    model,
    text: parsed.text,
    toolCalls: parsed.toolCalls,
    finishReason: parsed.finishReason,
    usage: { inputTokens: data.usageMetadata?.promptTokenCount, outputTokens: data.usageMetadata?.candidatesTokenCount },
  };
}

async function trackProviderUsage(provider: ModelProvider, ok: boolean, usage?: { inputTokens?: number; outputTokens?: number }) {
  try {
    await sql`
      INSERT INTO agent_provider_usage (provider, usage_day, requests, input_tokens, output_tokens, failures, last_used_at)
      VALUES (
        ${provider}, CURRENT_DATE, 1,
        ${usage?.inputTokens ?? 0}, ${usage?.outputTokens ?? 0},
        ${ok ? 0 : 1}, now()
      )
      ON CONFLICT (provider, usage_day) DO UPDATE SET
        requests = agent_provider_usage.requests + 1,
        input_tokens = agent_provider_usage.input_tokens + EXCLUDED.input_tokens,
        output_tokens = agent_provider_usage.output_tokens + EXCLUDED.output_tokens,
        failures = agent_provider_usage.failures + EXCLUDED.failures,
        last_used_at = now()`;
  } catch { /* non-fatal */ }
}

export async function generate(provider: ModelProvider, request: ModelRequest) {
  try {
    const result = provider === 'gemini' ? await gemini(request) : await openAiCompatible(provider, request);
    await trackProviderUsage(provider, true, result.usage);
    return result;
  } catch (e) {
    await trackProviderUsage(provider, false);
    throw e;
  }
}

/** Gemini multimodal vision — image URLs must be publicly fetchable (e.g. Cloudinary). */
export async function generateWithImages(request: ModelRequest & { imageUrls: string[] }) {
  const model = DEFAULT_MODELS.gemini;
  const urls = request.imageUrls.filter((u) => typeof u === 'string' && /^https:\/\//i.test(u)).slice(0, 6);
  if (!urls.length) throw new Error('At least one https image URL is required for vision analysis');
  const imageParts: Array<Record<string, unknown>> = [];
  for (const url of urls) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Could not fetch image (${res.status}): ${url.slice(0, 80)}`);
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 4_500_000) throw new Error('Image too large for vision analysis (max ~4.5MB)');
    imageParts.push({
      inline_data: {
        mime_type: contentType.startsWith('image/') ? contentType : 'image/jpeg',
        data: buf.toString('base64'),
      },
    });
  }
  const response = await fetch(`${ENDPOINTS.gemini}/${model}:generateContent?key=${encodeURIComponent(requireKey('gemini'))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: request.system ? { parts: [{ text: request.system }] } : undefined,
      contents: [{ role: 'user', parts: [...imageParts, { text: request.user }] }],
      generationConfig: { temperature: request.temperature ?? 0.1, maxOutputTokens: request.maxTokens ?? 2500 },
    }),
  });
  if (!response.ok) throw new Error(`gemini vision failed (${response.status})`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('gemini vision returned no output');
  return { provider: 'gemini' as const, model, text };
}

export async function generateWithFallback(preferred: ModelProvider[], request: ModelRequest) {
  const errors: string[] = [];
  const available = preferred.filter((provider) => Boolean(keyFor(provider)));
  if (!available.length) {
    throw new Error('No model providers configured (set GROQ_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY)');
  }
  for (const provider of available) {
    try {
      return await generate(provider, request);
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  throw new Error(`All configured model providers failed: ${errors.join('; ')}`);
}
