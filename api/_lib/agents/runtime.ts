import { randomUUID } from 'crypto';
import { generateWithFallback } from './providers.js';
import type { AgentContext, AgentId, AgentPolicy, AgentRunRecord, AgentTool, ModelProvider, ToolRisk } from './types.js';

const policies: Record<AgentId, AgentPolicy> = {
  'product-intelligence': { allowedTools: ['web.search', 'products.search', 'analytics.read'], requireApprovalFor: ['write', 'destructive'] },
  'trend-intelligence': { allowedTools: ['web.search', 'analytics.read'], requireApprovalFor: ['write', 'destructive'] },
  'marketing-intelligence': { allowedTools: ['web.search', 'products.search', 'analytics.read'], requireApprovalFor: ['write', 'destructive'] },
  sales: { allowedTools: ['products.search', 'inventory.read', 'customers.read'], requireApprovalFor: ['write', 'destructive'] },
  operations: { allowedTools: ['orders.read', 'inventory.read', 'shipping.read'], requireApprovalFor: ['write', 'destructive'] },
  engineering: { allowedTools: ['github.read', 'runtime.read', 'runtime.test'], requireApprovalFor: ['write', 'destructive'] },
};

const runs = new Map<string, AgentRunRecord>();
const tools = new Map<string, AgentTool>();

export function registerTool(tool: AgentTool) {
  if (tools.has(tool.name)) throw new Error(`Agent tool already registered: ${tool.name}`);
  tools.set(tool.name, tool);
}

export function getAgentPolicy(agentId: AgentId) {
  return policies[agentId];
}

export function listTools(agentId: AgentId) {
  const allowed = new Set(policies[agentId].allowedTools);
  return [...tools.values()].filter((tool) => allowed.has(tool.name));
}

function canUse(agentId: AgentId, tool: AgentTool, risk: ToolRisk) {
  const policy = policies[agentId];
  if (!policy.allowedTools.includes(tool.name)) throw new Error(`Agent ${agentId} is not permitted to use ${tool.name}`);
  if (policy.requireApprovalFor.includes(risk)) throw new Error(`Approval required for ${risk} tool: ${tool.name}`);
}

export async function executeTool(agentId: AgentId, runId: string, name: string, input: unknown) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Unknown agent tool: ${name}`);
  canUse(agentId, tool, tool.risk);
  const context: AgentContext = { agentId, runId, task: `tool:${name}` };
  return tool.execute(input, context);
}

export async function runAgent(input: {
  agentId: AgentId;
  task: string;
  providers?: ModelProvider[];
  system?: string;
}) {
  const id = randomUUID();
  const record: AgentRunRecord = { id, agentId: input.agentId, task: input.task, status: 'running', startedAt: new Date().toISOString() };
  runs.set(id, record);
  try {
    const result = await generateWithFallback(input.providers ?? ['groq', 'cerebras', 'gemini'], {
      system: input.system ?? `You are the ${input.agentId} agent for Vura. Use only verified information. Never invent business facts. If data is missing, say so.`,
      user: input.task,
    });
    record.status = 'completed';
    record.provider = result.provider;
    record.model = result.model;
    record.completedAt = new Date().toISOString();
    return { run: record, result };
  } catch (error) {
    record.status = 'failed';
    record.completedAt = new Date().toISOString();
    record.error = error instanceof Error ? error.message : 'Agent run failed';
    throw error;
  }
}

export function getRun(runId: string) {
  return runs.get(runId);
}
