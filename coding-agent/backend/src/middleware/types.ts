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
  points?: number;
  parentId?: string;  // For hierarchical structure
  depth?: number;     // 0 = epic, 1 = task, 2 = subtask (max)
}

export interface Checkpoint {
  id: string;
  timestamp: number;
  state: AgentState;
  name?: string;           // Short description (2-5 words) generated after processing
  actionSummary?: string;  // Detailed summary of actions taken (for tooltip)
}

export interface Middleware {
  name: string;
  tools: ToolDefinition[];
  systemPrompt: string;
  beforeInvoke?(state: AgentState): AgentState | Promise<AgentState>;
  afterInvoke?(state: AgentState): AgentState | Promise<AgentState>;
}
