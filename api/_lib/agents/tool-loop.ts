/**
 * Governed multi-turn tool-calling loop.
 *
 * This is the ONLY place an agent asks a model "which tool next" and then runs
 * it. Every model-requested tool call MUST pass through runtime.executeTool(),
 * which enforces policy, approval risk, tool registration, and writes audit
 * events. The model NEVER executes a tool directly.
 *
 * The loop is purely additive: existing single-shot agents are untouched.
 */
import { generateWithFallback } from './providers.js';
import { executeTool, listTools } from './runtime.js';
import type { AgentContext, ChatMessage, ModelProvider, ToolCall, ToolDefinition, ToolResult } from './types.js';

export interface ToolLoopOptions {
  /** System instruction describing the agent's role and constraints. */
  system?: string;
  /** The task the agent must complete. */
  task: string;
  /** Provider fallback order (defaults to groq, cerebras, gemini). */
  providers?: ModelProvider[];
  /** Hard cap on model turns (default 6). */
  maxTurns?: number;
  /** Restrict to these tool names; defaults to the agent's policy-allowed tools. */
  tools?: string[];
}

export type ToolLoopStopReason = 'final' | 'max_turns' | 'empty_response' | 'repeated_calls';

export interface ToolLoopResult {
  /** Final model text (may be empty if the loop stopped on a limit). */
  text: string;
  provider: ModelProvider;
  model: string;
  /** Number of model turns taken. */
  turns: number;
  /** Full normalized conversation, including all tool turns. */
  messages: ChatMessage[];
  usage: { inputTokens?: number; outputTokens?: number };
  stoppedReason: ToolLoopStopReason;
}

const DEFAULT_MAX_TURNS = 6;

/** Build the allowed tool definitions from the policy-allowed, registered tools. */
export function buildToolDefinitions(context: AgentContext, onlyNames?: string[]): ToolDefinition[] {
  const allowed = new Set(onlyNames?.length ? onlyNames : undefined);
  return listTools(context.agentId)
    .filter((t) => !allowed.size || allowed.has(t.name))
    .filter((t) => t.risk === 'read' || t.risk === 'draft')
    .map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
}

/** Fingerprint a set of tool calls to detect a repeated (infinite-loop) turn. */
function fingerprint(calls: ToolCall[]): string {
  return calls
    .map((c) => `${c.name}::${JSON.stringify(c.arguments ?? {})}`)
    .sort()
    .join('|');
}

export async function runAgentToolLoop(context: AgentContext, options: ToolLoopOptions): Promise<ToolLoopResult> {
  const maxTurns = Math.max(1, options.maxTurns ?? DEFAULT_MAX_TURNS);
  const providers = options.providers ?? ['groq', 'cerebras', 'gemini'];
  const tools = buildToolDefinitions(context, options.tools);

  const messages: ChatMessage[] = [{ role: 'user', content: options.task }];
  let turns = 0;
  let provider: ModelProvider = 'groq';
  let model = '';
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let previousFingerprint = '';

  while (turns < maxTurns) {
    turns += 1;
    const result = await generateWithFallback(providers, {
      system: options.system,
      user: '',
      messages,
      tools,
      toolChoice: 'auto',
    });
    provider = result.provider;
    model = result.model;
    inputTokens = (inputTokens ?? 0) + (result.usage?.inputTokens ?? 0);
    outputTokens = (outputTokens ?? 0) + (result.usage?.outputTokens ?? 0);

    const calls = result.toolCalls ?? [];
    const current = fingerprint(calls);

    if (!calls.length) {
      if (!result.text.trim()) {
        return { text: '', provider, model, turns, messages, usage: { inputTokens, outputTokens }, stoppedReason: 'empty_response' };
      }
      messages.push({ role: 'assistant', content: result.text });
      return { text: result.text, provider, model, turns, messages, usage: { inputTokens, outputTokens }, stoppedReason: 'final' };
    }

    // Guard: an identical set of tool calls across consecutive turns is a loop.
    if (current === previousFingerprint) {
      return { text: result.text, provider, model, turns, messages, usage: { inputTokens, outputTokens }, stoppedReason: 'repeated_calls' };
    }
    previousFingerprint = current;

    messages.push({ role: 'assistant', content: result.text || '', toolCalls: calls });

    const toolResults: ChatMessage[] = [];
    for (const call of calls) {
      if (!call.name || !tools.some((t) => t.name === call.name)) {
        toolResults.push({
          role: 'tool',
          toolCallId: call.id,
          toolResult: { ok: false, error: `Unknown tool: ${call.name}` },
        });
        continue;
      }
      let res: ToolResult;
      try {
        // ONLY path a model-requested tool may execute — governed + audited.
        const output = await executeTool(context.agentId, context.runId, call.name, call.arguments ?? {});
        res = { ok: true, output };
      } catch (error) {
        res = { ok: false, error: error instanceof Error ? error.message : 'Tool execution failed' };
      }
      toolResults.push({ role: 'tool', toolCallId: call.id, toolResult: res });
    }
    messages.push(...toolResults);
  }

  return {
    text: messages.filter((m) => m.role === 'assistant' && !m.toolCalls?.length).at(-1)?.content ?? '',
    provider,
    model,
    turns,
    messages,
    usage: { inputTokens, outputTokens },
    stoppedReason: 'max_turns',
  };
}
