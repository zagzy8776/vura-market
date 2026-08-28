import { getEnvironment } from '../env.js';
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

function keyFor(provider: ModelProvider) {
  return getEnvironment(
    provider === 'groq' ? 'GROQ_API_KEY' : provider === 'cerebras' ? 'CEREBRAS_API_KEY' : 'GEMINI_API_KEY',
  );
}

async function openAiCompatible(provider: ModelProvider, request: ModelRequest): Promise<ModelResponse> {
  const response = await fetch(ENDPOINTS[provider], {
    method: 'POST',
    headers: { Authorization: `Bearer ${keyFor(provider)}`, 'Content-Type': 'application/json' },
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
  const response = await fetch(`${ENDPOINTS.gemini}/${model}:generateContent?key=${encodeURIComponent(keyFor('gemini'))}`, {
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

export async function generate(provider: ModelProvider, request: ModelRequest) {
  return provider === 'gemini' ? gemini(request) : openAiCompatible(provider, request);
}

export async function generateWithFallback(preferred: ModelProvider[], request: ModelRequest) {
  const errors: string[] = [];
  for (const provider of preferred) {
    try {
      return await generate(provider, request);
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  throw new Error(`All configured model providers failed: ${errors.join('; ')}`);
}
