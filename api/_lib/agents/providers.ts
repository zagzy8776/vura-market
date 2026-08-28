import { getOptionalEnvironment } from '../env.js';
import { sql } from '../db.js';
import type { ModelProvider, ModelRequest, ModelResponse } from './types.js';

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  cerebras: process.env.CEREBRAS_MODEL || 'llama-3.3-70b',
  gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
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

async function openAiCompatible(provider: ModelProvider, request: ModelRequest): Promise<ModelResponse> {
  const response = await fetch(ENDPOINTS[provider], {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireKey(provider)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEFAULT_MODELS[provider],
      messages: [
        ...(request.system ? [{ role: 'system', content: request.system }] : []),
        { role: 'user', content: request.user },
      ],
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1200,
    }),
  });
  if (!response.ok) throw new Error(`${provider} model request failed (${response.status})`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${provider} returned no model output`);
  return { provider, model: DEFAULT_MODELS[provider], text, usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens } };
}

async function gemini(request: ModelRequest): Promise<ModelResponse> {
  const model = DEFAULT_MODELS.gemini;
  const response = await fetch(`${ENDPOINTS.gemini}/${model}:generateContent?key=${encodeURIComponent(requireKey('gemini'))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: request.system ? { parts: [{ text: request.system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: request.user }] }],
      generationConfig: { temperature: request.temperature ?? 0.2, maxOutputTokens: request.maxTokens ?? 1200 },
    }),
  });
  if (!response.ok) throw new Error(`gemini model request failed (${response.status})`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('gemini returned no model output');
  return { provider: 'gemini', model, text };
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
