import type { AgentTool } from './types.js';

const tools = new Map<string, AgentTool>();

export function registerTool(tool: AgentTool) {
  if (tools.has(tool.name)) throw new Error(`Agent tool already registered: ${tool.name}`);
  tools.set(tool.name, tool);
}

export function getTool(name: string) {
  return tools.get(name);
}

export function getAllTools() {
  return [...tools.values()];
}
