export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  points?: number;
  parentId?: string;  // For hierarchical structure
  depth?: number;     // 0 = epic, 1 = task, 2 = subtask (max)
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolRun {
  id: string;
  name: string;
  summary: string;
  status: 'running' | 'completed' | 'failed';
}

export interface SubtaskStatus {
  id: string;
  prompt: string;
  status: 'running' | 'completed' | 'failed';
  summary?: string;
}

export interface ContextUsage {
  tokens: number;
  percentage: number;
  warning: boolean;
}

export interface Checkpoint {
  id: string;
  timestamp: number;
}

// IDE-style step types for assistant messages
export type StepType = 'text' | 'tool' | 'subtask';

export interface AssistantStep {
  id: string;
  type: StepType;
  timestamp: number;
  isCollapsed: boolean;

  // For text steps
  content?: string;
  isStreaming?: boolean;

  // For tool steps
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolSummary?: string;
  status?: 'running' | 'completed' | 'failed';
  filePath?: string;

  // For subtask steps
  subtaskPrompt?: string;
  subtaskSummary?: string;
}
