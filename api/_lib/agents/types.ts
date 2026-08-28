export type AgentId =
  | 'product-intelligence'
  | 'trend-intelligence'
  | 'marketing-intelligence'
  | 'sales'
  | 'operations'
  | 'engineering';

export type ModelProvider = 'groq' | 'cerebras' | 'gemini';
export type ToolRisk = 'read' | 'draft' | 'write' | 'destructive';

export interface AgentContext {
  agentId: AgentId;
  runId: string;
  task: string;
  metadata?: Record<string, unknown>;
}

export interface ModelRequest {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelResponse {
  provider: ModelProvider;
  model: string;
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  risk: ToolRisk;
  execute(input: TInput, context: AgentContext): Promise<TOutput>;
}

export interface AgentRunRecord {
  id: string;
  agentId: AgentId;
  task: string;
  status: 'running' | 'completed' | 'failed' | 'awaiting_approval';
  provider?: ModelProvider;
  model?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface AgentPolicy {
  allowedTools: string[];
  requireApprovalFor: ToolRisk[];
}
