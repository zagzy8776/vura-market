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
  /** A single-turn JSON schema declaration the model should conform to. */
  responseJsonSchema?: Record<string, unknown>;
  /** Optional message history for multi-turn tool-calling loops. */
  messages?: ChatMessage[];
  /** Tool definitions made available to the model (adapter translates to provider wire format). */
  tools?: ToolDefinition[];
  /** How the model should select a tool. */
  toolChoice?: 'auto' | 'none';
}

export interface ModelResponse {
  provider: ModelProvider;
  model: string;
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** Tool calls the model requested (empty when the model produced plain text). */
  toolCalls?: ToolCall[];
  /** Reason generation stopped, when the provider reports one. */
  finishReason?: string;
}

/** A single message in an agent conversation. Roles mirror the normalized provider-neutral shape. */
export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatMessageRole;
  /** Text of the message. Empty/absent for tool-result turns. */
  content?: string;
  /** Present on assistant turns that produced tool calls. Empty otherwise. */
  toolCalls?: ToolCall[];
  /** Present on tool turns; the id of the assistant tool call this is a result for. */
  toolCallId?: string;
  /** Present on tool turns; the normalized tool result value. */
  toolResult?: ToolResult;
}

/** JSON-schema-compatible declaration for a single tool parameter. */
export interface ToolParameterSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: Array<string | number>;
  items?: ToolParameterSchema;
  required?: string[];
  properties?: Record<string, ToolParameterSchema>;
}

/** A tool surfaced to the model. Derived from an AgentTool plus an explicit parameter schema. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: ToolParameterSchema;
}

/** A tool invocation the model requested. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** The normalized result of executing a tool, fed back to the model as a tool-result message. */
export interface ToolResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  risk: ToolRisk;
  /** Optional JSON-schema-compatible parameter definition used to generate provider tool definitions. */
  parameters?: ToolParameterSchema;
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
