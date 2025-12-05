import { ToolDefinition } from '../tools/ToolRegistry.js';

export interface AgentState {
  sessionId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
  todos: Todo[];
  files: Map<string, string>;
  checkpoints: Map<string, Checkpoint>;
  contextUsage: { tokens: number; percentage: number };
}

export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface Checkpoint {
  id: string;
  timestamp: number;
  state: AgentState;
}

export interface Middleware {
  name: string;
  tools: ToolDefinition[];
  systemPrompt: string;
  beforeInvoke?(state: AgentState): AgentState | Promise<AgentState>;
  afterInvoke?(state: AgentState): AgentState | Promise<AgentState>;
}
