export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  points?: number;
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
