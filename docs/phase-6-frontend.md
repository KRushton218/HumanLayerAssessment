# Phase 6: React Frontend

## Overview

Create the React frontend with Vite, Tailwind CSS, and components for chat, todo list, tool status, context meter, and subtask indicator.

## Prerequisites

- Phases 1-5 completed successfully
- Backend fully functional with all middleware

---

## Changes Required

### 1. Create Frontend Project

**Action**: Initialize Vite project with React and TypeScript

```bash
mkdir -p frontend
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 2. Frontend package.json

**File**: `frontend/package.json`

```json
{
  "name": "coding-agent-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.2",
    "vite": "^5.0.8"
  }
}
```

### 3. Tailwind Configuration

**File**: `frontend/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### 4. CSS with Tailwind

**File**: `frontend/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-900 text-gray-100;
}
```

### 5. Types

**File**: `frontend/src/types.ts`

```typescript
export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolStatus {
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
```

### 6. SSE Hook

**File**: `frontend/src/hooks/useSSE.ts`

```typescript
import { useEffect, useRef, useCallback } from 'react';

type EventHandler = (data: any) => void;

export function useSSE(sessionId: string | null, handlers: Record<string, EventHandler>) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(`http://localhost:3001/api/events/${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('SSE connected');
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };

    // Register event handlers
    const eventTypes = [
      'connected', 'text', 'tool_start', 'tool_complete',
      'todo_update', 'subtask_start', 'subtask_complete',
      'context_update', 'checkpoint_created', 'reverted', 'error'
    ];

    eventTypes.forEach(eventType => {
      eventSource.addEventListener(eventType, (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        handlersRef.current[eventType]?.(data);
      });
    });

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  return eventSourceRef.current;
}
```

### 7. API Client

**File**: `frontend/src/api.ts`

```typescript
const API_BASE = 'http://localhost:3001/api';

export async function createSession(): Promise<string> {
  const res = await fetch(`${API_BASE}/session`, { method: 'POST' });
  const data = await res.json();
  return data.sessionId;
}

export async function sendMessage(sessionId: string, message: string, model?: string): Promise<void> {
  await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, model }),
  });
}

export async function getTodos(sessionId: string) {
  const res = await fetch(`${API_BASE}/todos/${sessionId}`);
  return res.json();
}

export async function getCheckpoints(sessionId: string) {
  const res = await fetch(`${API_BASE}/checkpoints/${sessionId}`);
  return res.json();
}

export async function revertToCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
  await fetch(`${API_BASE}/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, checkpointId }),
  });
}

export async function forkFromCheckpoint(sessionId: string, checkpointId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, checkpointId }),
  });
  const data = await res.json();
  return data.newSessionId;
}

export async function setModel(model: string): Promise<void> {
  await fetch(`${API_BASE}/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
}
```

### 8. ChatPanel Component

**File**: `frontend/src/components/ChatPanel.tsx`

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';

interface ChatPanelProps {
  messages: Message[];
  streamingText: string;
  onSendMessage: (message: string) => void;
  isProcessing: boolean;
}

export function ChatPanel({ messages, streamingText, onSendMessage, isProcessing }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-600 ml-8'
                : 'bg-gray-700 mr-8'
            }`}
          >
            <div className="text-xs text-gray-400 mb-1">
              {msg.role === 'user' ? 'You' : 'Agent'}
            </div>
            <div className="whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
        {streamingText && (
          <div className="p-3 rounded-lg bg-gray-700 mr-8">
            <div className="text-xs text-gray-400 mb-1">Agent</div>
            <div className="whitespace-pre-wrap">{streamingText}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isProcessing}
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isProcessing || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

### 9. TodoList Component

**File**: `frontend/src/components/TodoList.tsx`

```typescript
import React from 'react';
import { Todo } from '../types';

interface TodoListProps {
  todos: Todo[];
}

export function TodoList({ todos }: TodoListProps) {
  const getStatusIcon = (status: Todo['status']) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'in_progress':
        return '▶';
      default:
        return '○';
    }
  };

  const getStatusColor = (status: Todo['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'in_progress':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Todo List</h2>
      {todos.length === 0 ? (
        <p className="text-gray-500 italic">No tasks yet</p>
      ) : (
        <ul className="space-y-2">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={`flex items-start gap-2 p-2 rounded ${
                todo.status === 'in_progress' ? 'bg-gray-800' : ''
              }`}
            >
              <span className={`${getStatusColor(todo.status)} mt-0.5`}>
                {getStatusIcon(todo.status)}
              </span>
              <span className={todo.status === 'completed' ? 'line-through text-gray-500' : ''}>
                {todo.content}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### 10. ToolStatus Component

**File**: `frontend/src/components/ToolStatus.tsx`

```typescript
import React from 'react';
import { ToolStatus as ToolStatusType } from '../types';

interface ToolStatusProps {
  tools: ToolStatusType[];
}

export function ToolStatus({ tools }: ToolStatusProps) {
  if (tools.length === 0) return null;

  return (
    <div className="p-4 border-t border-gray-700">
      <h3 className="text-sm font-semibold mb-2 text-gray-400">Tools</h3>
      <div className="space-y-1">
        {tools.slice(-5).map((tool, idx) => (
          <div
            key={idx}
            className={`text-sm flex items-center gap-2 ${
              tool.status === 'running' ? 'text-yellow-400' :
              tool.status === 'completed' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            <span>
              {tool.status === 'running' ? '⟳' : tool.status === 'completed' ? '✓' : '✗'}
            </span>
            <span>{tool.name}: {tool.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 11. SubTaskIndicator Component

**File**: `frontend/src/components/SubTaskIndicator.tsx`

```typescript
import React from 'react';
import { SubtaskStatus } from '../types';

interface SubTaskIndicatorProps {
  subtask: SubtaskStatus | null;
}

export function SubTaskIndicator({ subtask }: SubTaskIndicatorProps) {
  if (!subtask) return null;

  return (
    <div className="p-4 border-t border-gray-700 bg-gray-800">
      <div className="flex items-center gap-2 mb-2">
        <span className={`${
          subtask.status === 'running' ? 'animate-spin text-yellow-400' :
          subtask.status === 'completed' ? 'text-green-400' : 'text-red-400'
        }`}>
          ⟳
        </span>
        <span className="text-sm font-semibold">
          {subtask.status === 'running' ? 'Subtask Running' : 'Subtask Complete'}
        </span>
      </div>
      <p className="text-sm text-gray-400 truncate">{subtask.prompt}</p>
      {subtask.summary && (
        <p className="text-sm text-gray-300 mt-1">{subtask.summary}</p>
      )}
    </div>
  );
}
```

### 12. ContextMeter Component

**File**: `frontend/src/components/ContextMeter.tsx`

```typescript
import React from 'react';
import { ContextUsage } from '../types';

interface ContextMeterProps {
  usage: ContextUsage;
}

export function ContextMeter({ usage }: ContextMeterProps) {
  const getColor = () => {
    if (usage.percentage >= 40) return 'bg-red-500';
    if (usage.percentage >= 32) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-400">Context:</span>
      <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all duration-300`}
          style={{ width: `${Math.min(usage.percentage, 100)}%` }}
        />
      </div>
      <span className={`text-sm ${usage.warning ? 'text-yellow-400' : 'text-gray-400'}`}>
        {usage.percentage.toFixed(0)}%
      </span>
    </div>
  );
}
```

### 13. ModelSelector Component

**File**: `frontend/src/components/ModelSelector.tsx`

```typescript
import React from 'react';

interface ModelSelectorProps {
  model: string;
  onModelChange: (model: string) => void;
}

const MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
];

export function ModelSelector({ model, onModelChange }: ModelSelectorProps) {
  return (
    <select
      value={model}
      onChange={(e) => onModelChange(e.target.value)}
      className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
    >
      {MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
```

### 14. CheckpointControls Component

**File**: `frontend/src/components/CheckpointControls.tsx`

```typescript
import React from 'react';
import { Checkpoint } from '../types';

interface CheckpointControlsProps {
  checkpoints: Checkpoint[];
  onRevert: (checkpointId: string) => void;
  onFork: (checkpointId: string) => void;
}

export function CheckpointControls({ checkpoints, onRevert, onFork }: CheckpointControlsProps) {
  if (checkpoints.length === 0) return null;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="p-4 border-t border-gray-700">
      <h3 className="text-sm font-semibold mb-2 text-gray-400">Checkpoints</h3>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {checkpoints.slice(0, 5).map((cp) => (
          <div key={cp.id} className="flex items-center justify-between text-sm">
            <span className="text-gray-400">{formatTime(cp.timestamp)}</span>
            <div className="flex gap-2">
              <button
                onClick={() => onRevert(cp.id)}
                className="text-blue-400 hover:text-blue-300"
              >
                Revert
              </button>
              <button
                onClick={() => onFork(cp.id)}
                className="text-green-400 hover:text-green-300"
              >
                Fork
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 15. Main App Component

**File**: `frontend/src/App.tsx`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { TodoList } from './components/TodoList';
import { ToolStatus } from './components/ToolStatus';
import { SubTaskIndicator } from './components/SubTaskIndicator';
import { ContextMeter } from './components/ContextMeter';
import { ModelSelector } from './components/ModelSelector';
import { CheckpointControls } from './components/CheckpointControls';
import { useSSE } from './hooks/useSSE';
import * as api from './api';
import type {
  Message,
  Todo,
  ToolStatus as ToolStatusType,
  SubtaskStatus,
  ContextUsage,
  Checkpoint,
} from './types';

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [tools, setTools] = useState<ToolStatusType[]>([]);
  const [subtask, setSubtask] = useState<SubtaskStatus | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsage>({ tokens: 0, percentage: 0, warning: false });
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize session
  useEffect(() => {
    api.createSession().then(setSessionId);
  }, []);

  // SSE event handlers
  const sseHandlers = {
    text: useCallback((data: { content: string }) => {
      setStreamingText(prev => prev + data.content);
    }, []),

    tool_start: useCallback((data: { name: string; summary: string }) => {
      setTools(prev => [...prev, { ...data, status: 'running' }]);
    }, []),

    tool_complete: useCallback((data: { name: string; success: boolean }) => {
      setTools(prev =>
        prev.map(t =>
          t.name === data.name && t.status === 'running'
            ? { ...t, status: data.success ? 'completed' : 'failed' }
            : t
        )
      );
    }, []),

    todo_update: useCallback((data: { todos: Todo[] }) => {
      setTodos(data.todos);
    }, []),

    subtask_start: useCallback((data: { id: string; prompt: string }) => {
      setSubtask({ ...data, status: 'running' });
    }, []),

    subtask_complete: useCallback((data: { id: string; success: boolean; summary?: string }) => {
      setSubtask(prev =>
        prev?.id === data.id
          ? { ...prev, status: data.success ? 'completed' : 'failed', summary: data.summary }
          : prev
      );
      // Clear subtask after delay
      setTimeout(() => setSubtask(null), 3000);
    }, []),

    context_update: useCallback((data: ContextUsage) => {
      setContextUsage(data);
    }, []),

    checkpoint_created: useCallback((data: { id: string }) => {
      setCheckpoints(prev => [{ id: data.id, timestamp: Date.now() }, ...prev]);
    }, []),

    reverted: useCallback(() => {
      // Refresh state after revert
      if (sessionId) {
        api.getTodos(sessionId).then(data => setTodos(data.todos || []));
      }
    }, [sessionId]),

    error: useCallback((data: { error: string }) => {
      console.error('Agent error:', data.error);
      setIsProcessing(false);
    }, []),
  };

  useSSE(sessionId, sseHandlers);

  const handleSendMessage = async (content: string) => {
    if (!sessionId) return;

    setIsProcessing(true);
    setStreamingText('');
    setMessages(prev => [...prev, { role: 'user', content }]);

    try {
      await api.sendMessage(sessionId, content, model);
      // Finalize streaming text as assistant message
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: streamingText || '(Agent completed task)' },
      ]);
      setStreamingText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModelChange = async (newModel: string) => {
    setModel(newModel);
    await api.setModel(newModel);
  };

  const handleRevert = async (checkpointId: string) => {
    if (!sessionId) return;
    await api.revertToCheckpoint(sessionId, checkpointId);
  };

  const handleFork = async (checkpointId: string) => {
    if (!sessionId) return;
    const newSessionId = await api.forkFromCheckpoint(sessionId, checkpointId);
    setSessionId(newSessionId);
    setMessages([]);
    setStreamingText('');
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Coding Agent</h1>
        <div className="flex items-center gap-4">
          <ModelSelector model={model} onModelChange={handleModelChange} />
          <ContextMeter usage={contextUsage} />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat panel */}
        <div className="flex-1 flex flex-col border-r border-gray-700">
          <ChatPanel
            messages={messages}
            streamingText={streamingText}
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
          />
          <ToolStatus tools={tools} />
          <SubTaskIndicator subtask={subtask} />
        </div>

        {/* Sidebar */}
        <div className="w-80 flex flex-col overflow-y-auto">
          <TodoList todos={todos} />
          <CheckpointControls
            checkpoints={checkpoints}
            onRevert={handleRevert}
            onFork={handleFork}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
```

### 16. Vite Config

**File**: `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
```

---

## Success Criteria

### Automated Verification
- [ ] `cd frontend && npm install` completes without errors
- [ ] `cd frontend && npm run typecheck` passes
- [ ] `cd frontend && npm run build` succeeds

### Manual Verification
- [ ] `npm run dev` starts frontend on http://localhost:5173
- [ ] UI displays correctly with header, chat panel, and sidebar
- [ ] Chat input accepts messages and disables during processing
- [ ] Todo list section is visible in sidebar
- [ ] Context meter displays in header with percentage
- [ ] Model selector dropdown works
- [ ] Tool status section shows tool executions
- [ ] Subtask indicator appears when subtasks run

---

## Next Phase

Once all success criteria are met, proceed to [Phase 7: Integration & E2E Testing](./phase-7-integration.md).
