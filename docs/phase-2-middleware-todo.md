# Phase 2: Middleware System & TodoMiddleware

## Overview

Implement the core middleware architecture and the TodoMiddleware that provides planning capabilities (write_todos, read_todos).

## Prerequisites

- Phase 1 completed successfully
- Backend server running

---

## Changes Required

### 1. Middleware Interface

**File**: `backend/src/middleware/types.ts`

```typescript
import { ToolDefinition } from '../tools/ToolRegistry.js';

export interface AgentState {
  sessionId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: any }>;
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
```

### 2. MiddlewareManager

**File**: `backend/src/middleware/MiddlewareManager.ts`

```typescript
import { Middleware, AgentState } from './types.js';
import { ToolDefinition, ToolRegistry } from '../tools/ToolRegistry.js';

export class MiddlewareManager {
  private middlewares: Middleware[] = [];
  private toolRegistry: ToolRegistry;

  constructor() {
    this.toolRegistry = new ToolRegistry();
  }

  register(middleware: Middleware): void {
    this.middlewares.push(middleware);

    // Register all tools from middleware
    for (const tool of middleware.tools) {
      this.toolRegistry.register(tool);
    }
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  composeSystemPrompt(): string {
    const CORE_IDENTITY = `You are a skilled software engineer working on coding tasks.
You approach problems methodically, breaking them into manageable steps.

## Key Behaviors
1. ALWAYS update your todo list before and after each task
2. Use the filesystem for context offloading - write notes, plans, and intermediate results
3. For complex subtasks, delegate to spawn_subtask to keep your context clean
4. Explain your reasoning before taking actions`;

    const TASK_GUIDANCE = `## General Guidelines
- Be thorough but efficient
- Verify your work before marking tasks complete
- Ask for clarification if requirements are unclear
- Keep the user informed of progress`;

    const middlewarePrompts = this.middlewares
      .map(m => m.systemPrompt)
      .filter(p => p.length > 0);

    return [CORE_IDENTITY, ...middlewarePrompts, TASK_GUIDANCE].join('\n\n---\n\n');
  }

  async runBeforeHooks(state: AgentState): Promise<AgentState> {
    let currentState = state;
    for (const middleware of this.middlewares) {
      if (middleware.beforeInvoke) {
        currentState = await middleware.beforeInvoke(currentState);
      }
    }
    return currentState;
  }

  async runAfterHooks(state: AgentState): Promise<AgentState> {
    let currentState = state;
    for (const middleware of this.middlewares) {
      if (middleware.afterInvoke) {
        currentState = await middleware.afterInvoke(currentState);
      }
    }
    return currentState;
  }
}
```

### 3. TodoMiddleware

**File**: `backend/src/middleware/TodoMiddleware.ts`

```typescript
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Middleware, AgentState, Todo } from './types.js';
import { ToolDefinition, ToolContext, ToolResult } from '../tools/ToolRegistry.js';

// In-memory todo storage per session
const todoStore = new Map<string, Todo[]>();

const TodoSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

const WriteTodosSchema = z.object({
  todos: z.array(TodoSchema),
});

const ReadTodosSchema = z.object({});

export class TodoMiddleware implements Middleware {
  name = 'TodoMiddleware';

  systemPrompt = `## Todo List (Planning Tool)
You have access to a todo list for tracking task progress.
- Use write_todos to update your task list when starting work
- Use read_todos to check current progress
- Mark tasks in_progress BEFORE starting work on them
- Mark tasks completed IMMEDIATELY after finishing
- Break complex tasks into smaller subtasks
- Never have more than one task in_progress at a time
- Update todos frequently to show progress`;

  tools: ToolDefinition[] = [
    {
      name: 'write_todos',
      description: 'Update the todo list with new tasks or status changes. Replaces the entire todo list.',
      inputSchema: WriteTodosSchema,
      execute: async (input: z.infer<typeof WriteTodosSchema>, context: ToolContext): Promise<ToolResult> => {
        const todos: Todo[] = input.todos.map(t => ({
          id: t.id || uuidv4(),
          content: t.content,
          status: t.status,
        }));

        todoStore.set(context.sessionId, todos);

        // Emit update event
        context.emit('todo_update', { todos });

        return {
          success: true,
          output: `Updated todo list with ${todos.length} items`,
        };
      },
    },
    {
      name: 'read_todos',
      description: 'Read the current todo list to check progress',
      inputSchema: ReadTodosSchema,
      execute: async (_input: z.infer<typeof ReadTodosSchema>, context: ToolContext): Promise<ToolResult> => {
        const todos = todoStore.get(context.sessionId) || [];

        return {
          success: true,
          output: JSON.stringify(todos, null, 2),
        };
      },
    },
  ];

  getTodos(sessionId: string): Todo[] {
    return todoStore.get(sessionId) || [];
  }

  beforeInvoke(state: AgentState): AgentState {
    // Sync todos from store to state
    state.todos = todoStore.get(state.sessionId) || [];
    return state;
  }
}
```

### 4. Export Middleware

**File**: `backend/src/middleware/index.ts`

```typescript
export * from './types.js';
export * from './MiddlewareManager.js';
export * from './TodoMiddleware.js';
```

---

## Success Criteria

### Automated Verification
- [ ] `cd backend && npm run typecheck` passes
- [ ] `cd backend && npm run lint` passes

### Manual Verification
- [ ] MiddlewareManager can register TodoMiddleware
- [ ] `composeSystemPrompt()` returns combined prompts with core identity + todo guidance
- [ ] Todo tools are registered in ToolRegistry
- [ ] `getToolSchemas()` returns proper JSON schema for todo tools

---

## Next Phase

Once all success criteria are met, proceed to [Phase 3: FilesystemMiddleware](./phase-3-filesystem.md).
