import { randomUUID } from 'crypto';
import { generateWithFallback } from './providers.js';
import { sql } from '../db.js';
import type { AgentContext, AgentId, AgentPolicy, AgentRunRecord, AgentTool, ModelProvider } from './types.js';
import { registerTool as registerToolInMap, getTool, getAllTools } from './tool-registry.js';
import { registerBuiltinTools } from './tools/index.js';

export function registerTool(tool: AgentTool) {
  registerToolInMap(tool);
}

const policies: Record<AgentId, AgentPolicy> = {
  'product-intelligence': { allowedTools: ['web.search', 'products.search', 'product.inspect', 'inventory.read', 'analytics.read'], requireApprovalFor: ['write', 'destructive'] },
  'trend-intelligence': { allowedTools: ['web.search', 'products.search', 'analytics.read', 'trend.collect', 'trend.score'], requireApprovalFor: ['write', 'destructive'] },
  'marketing-intelligence': { allowedTools: ['web.search', 'products.search', 'product.inspect', 'analytics.read'], requireApprovalFor: ['write', 'destructive'] },
  sales: { allowedTools: ['products.search', 'product.inspect', 'inventory.read', 'orders.read', 'analytics.read'], requireApprovalFor: ['write', 'destructive'] },
  operations: { allowedTools: ['orders.read', 'inventory.read', 'products.search', 'product.inspect'], requireApprovalFor: ['write', 'destructive'] },
  engineering: { allowedTools: ['github.read', 'runtime.read', 'runtime.test'], requireApprovalFor: ['write', 'destructive'] },
};

export function getAgentPolicy(agentId: AgentId) {
  return policies[agentId];
}

export function listTools(agentId: AgentId) {
  registerBuiltinTools();
  const allowed = new Set(policies[agentId].allowedTools);
  return getAllTools().filter((tool) => allowed.has(tool.name));
}

function canUse(agentId: AgentId, tool: AgentTool) {
  const policy = policies[agentId];
  if (!policy.allowedTools.includes(tool.name)) throw new Error(`Agent ${agentId} is not permitted to use ${tool.name}`);
  // WRITE/DESTRUCTIVE tools cannot execute here — must go through approval queue first
  if (tool.risk === 'write' || tool.risk === 'destructive' || policy.requireApprovalFor.includes(tool.risk)) {
    throw new Error(`Approval required for ${tool.risk} tool: ${tool.name}`);
  }
}

function safeJson(value: unknown) {
  try {
    const text = JSON.stringify(value);
    return text && text.length > 12000 ? `${text.slice(0, 12000)}…` : text ?? '{}';
  } catch {
    return '{}';
  }
}

export async function executeTool(agentId: AgentId, runId: string, name: string, input: unknown) {
  registerBuiltinTools();
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown agent tool: ${name}`);
  canUse(agentId, tool);
  const context: AgentContext = { agentId, runId, task: `tool:${name}` };
  const eventId = randomUUID();
  await sql`INSERT INTO agent_events (id, run_id, event_type, tool_name, risk, input) VALUES (${eventId}, ${runId}, 'tool.started', ${name}, ${tool.risk}, ${safeJson(input)}::jsonb)`;
  try {
    const output = await tool.execute(input, context);
    await sql`UPDATE agent_events SET event_type = 'tool.completed', output = ${safeJson(output)}::jsonb WHERE id = ${eventId}`;
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed';
    await sql`UPDATE agent_events SET event_type = 'tool.failed', error = ${message} WHERE id = ${eventId}`;
    throw error;
  }
}

export async function requestApproval(input: { runId: string; agentId: AgentId; toolName: string; risk: 'write' | 'destructive'; toolInput: unknown }) {
  const id = randomUUID();
  await sql`INSERT INTO agent_approvals (id, run_id, agent_id, tool_name, risk, input) VALUES (${id}, ${input.runId}, ${input.agentId}, ${input.toolName}, ${input.risk}, ${safeJson(input.toolInput)}::jsonb)`;
  await sql`UPDATE agent_runs SET status = 'awaiting_approval' WHERE id = ${input.runId}`;
  return id;
}

export async function runAgent(input: {
  registerBuiltinTools();
  agentId: AgentId;
  task: string;
  providers?: ModelProvider[];
  system?: string;
}) {
  const id = randomUUID();
  const record: AgentRunRecord = { id, agentId: input.agentId, task: input.task, status: 'running', startedAt: new Date().toISOString() };
  await sql`INSERT INTO agent_runs (id, agent_id, task, status) VALUES (${id}, ${input.agentId}, ${input.task}, 'running')`;

  try {
    const result = await generateWithFallback(input.providers ?? ['groq', 'cerebras', 'gemini'], {
      system: input.system ?? `You are the ${input.agentId} agent for Vura. Use only verified information. Never invent business facts. If data is missing, say so.`,
      user: input.task,
    });
    record.status = 'completed';
    record.provider = result.provider;
    record.model = result.model;
    record.completedAt = new Date().toISOString();
    await sql`UPDATE agent_runs SET status = 'completed', provider = ${result.provider}, model = ${result.model}, completed_at = now() WHERE id = ${id}`;
    await sql`INSERT INTO agent_provider_usage (provider, requests, input_tokens, output_tokens, last_used_at) VALUES (${result.provider}, 1, ${result.usage?.inputTokens ?? 0}, ${result.usage?.outputTokens ?? 0}, now()) ON CONFLICT (provider, usage_day) DO UPDATE SET requests = agent_provider_usage.requests + 1, input_tokens = agent_provider_usage.input_tokens + EXCLUDED.input_tokens, output_tokens = agent_provider_usage.output_tokens + EXCLUDED.output_tokens, last_used_at = now()`;
    return { run: record, result };
  } catch (error) {
    record.status = 'failed';
    record.completedAt = new Date().toISOString();
    record.error = error instanceof Error ? error.message : 'Agent run failed';
    await sql`UPDATE agent_runs SET status = 'failed', error = ${record.error}, completed_at = now() WHERE id = ${id}`;
    return { run: record, error: record.error };
  }
}

export async function getRun(runId: string) {
  const rows = await sql`SELECT id, agent_id, task, status, provider, model, started_at, completed_at, error FROM agent_runs WHERE id = ${runId} LIMIT 1`;
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: String(row.id), agentId: String(row.agent_id) as AgentId, task: String(row.task), status: row.status as AgentRunRecord['status'],
    provider: row.provider ? String(row.provider) as ModelProvider : undefined, model: row.model ? String(row.model) : undefined,
    startedAt: new Date(String(row.started_at)).toISOString(), completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined,
    error: row.error ? String(row.error) : undefined,
  } satisfies AgentRunRecord;
}
