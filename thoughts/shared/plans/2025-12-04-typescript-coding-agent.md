# TypeScript Coding Agent Implementation Plan

## Overview

Build a TypeScript-based AI coding agent that runs locally with a web UI, implementing the **four principles** identified in deep agent research for handling long-horizon tasks:

1. **Planning Tool** - TodoManager with write_todos/read_todos
2. **Filesystem Access** - File tools with context offloading
3. **Sub-agent Delegation** - Task spawning with isolated context
4. **Detailed Prompting** - Structured system prompts per component

The architecture uses a middleware-based design for extensibility, with React + Vite frontend and Node.js + Express backend communicating via Server-Sent Events (SSE).

## Current State Analysis

This is a **greenfield project** with:
- Comprehensive PRD at `docs/prd.md` (575 lines)
- Research documentation at `docs/DeepAgents_Harness_Documentation.md`
- No existing implementation code
- No package.json files
- No build configuration

## Desired End State

A fully functional local coding agent with:
- Middleware-based backend that composes tools and prompts
- Real-time SSE streaming of agent actions to the UI
- Todo list management visible in the UI
- File operations with path safety
- Sub-agent spawning for isolated tasks
- Checkpoint/revert/fork capabilities
- Context usage monitoring
- Professional React UI with live updates

### Verification of End State:
- Agent can receive a coding task via chat
- Agent creates and updates todos (visible in UI)
- Agent can read/write/edit files
- Agent can spawn sub-tasks for isolated work
- All tool executions stream to UI in real-time
- Context meter shows usage under 40%
- User can revert to previous checkpoints

## What We're NOT Doing

Per the PRD, these are explicitly out of scope for MVP:
- Sub-agent pool architecture (single subtask at a time is sufficient)
- Parallel tool execution with dependency graphs
- Semantic code search / embeddings
- LSP integration
- Git operations (using file snapshots instead)
- Vector database
- Learning from past executions
- Advanced sandboxing / containers
- Multiple concurrent subtasks

---

## Phase 1: Project Setup & Core Backend Infrastructure

### Overview
Set up the project structure, TypeScript configuration, dependencies, and core backend infrastructure including the Express server with SSE support and the foundational tool registry.

### Changes Required:

#### 1. Create Project Structure
**Action**: Create directory structure

```
coding-agent/
├── backend/
│   ├── src/
│   │   ├── middleware/
│   │   ├── agent/
│   │   ├── tools/
│   │   ├── prompts/
│   │   ├── routes/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   └── (created in Phase 6)
└── README.md
```

#### 2. Backend package.json
**File**: `backend/package.json`

```json
{
  "name": "coding-agent-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "express": "^4.18.2",
    "zod": "^3.22.4",
    "execa": "^8.0.1",
    "uuid": "^9.0.1",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.7",
    "@types/cors": "^2.8.17",
    "typescript": "^5.3.2",
    "tsx": "^4.6.2",
    "eslint": "^8.55.0",
    "@typescript-eslint/eslint-plugin": "^6.13.1",
    "@typescript-eslint/parser": "^6.13.1"
  }
}
```

#### 3. TypeScript Configuration
**File**: `backend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 4. Tool Registry
**File**: `backend/src/tools/ToolRegistry.ts`

```typescript
import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  execute: (input: any, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  sessionId: string;
  workingDirectory: string;
  emit: (event: string, data: any) => void;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolSchemas(): Array<{
    name: string;
    description: string;
    input_schema: object;
  }> {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: this.zodToJsonSchema(tool.inputSchema),
    }));
  }

  private zodToJsonSchema(schema: z.ZodType<any>): object {
    // Simplified Zod to JSON Schema conversion
    // In production, use zod-to-json-schema package
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodType<any>);
        if (!(value as any).isOptional()) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    if (schema instanceof z.ZodString) {
      return { type: 'string' };
    }

    if (schema instanceof z.ZodNumber) {
      return { type: 'number' };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(schema.element),
      };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema.options,
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap());
    }

    return { type: 'string' };
  }
}
```

#### 5. LLM Client
**File**: `backend/src/agent/LLMClient.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string;
}

export interface LLMClientConfig {
  model?: string;
  maxTokens?: number;
}

export class LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: LLMClientConfig = {}) {
    this.client = new Anthropic();
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 8096;
  }

  async *streamMessage(
    systemPrompt: string,
    messages: Message[],
    tools: Array<{ name: string; description: string; input_schema: object }>
  ): AsyncGenerator<{
    type: 'text' | 'tool_use' | 'message_stop' | 'content_block_stop';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
  }> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      tools: tools.length > 0 ? tools : undefined,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          // Tool input streaming - accumulate in caller
          yield { type: 'tool_use', text: event.delta.partial_json };
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          yield {
            type: 'tool_use',
            id: event.content_block.id,
            name: event.content_block.name,
          };
        }
      } else if (event.type === 'content_block_stop') {
        yield { type: 'content_block_stop' };
      } else if (event.type === 'message_stop') {
        yield { type: 'message_stop' };
      }
    }
  }

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }
}
```

#### 6. Express Server with SSE
**File**: `backend/src/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Store active SSE connections
const connections = new Map<string, express.Response>();

// SSE endpoint
app.get('/api/events/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  connections.set(sessionId, res);

  req.on('close', () => {
    connections.delete(sessionId);
  });
});

// Helper to emit SSE events
export function emitEvent(sessionId: string, event: string, data: any): void {
  const connection = connections.get(sessionId);
  if (connection) {
    connection.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Create new session
app.post('/api/session', (req, res) => {
  const sessionId = uuidv4();
  res.json({ sessionId });
});

// Chat endpoint (placeholder - will be implemented in Phase 4)
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message required' });
  }

  // Placeholder response
  res.json({ status: 'received', sessionId });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

#### 7. ESLint Configuration
**File**: `backend/.eslintrc.json`

```json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "env": {
    "node": true,
    "es2022": true
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off"
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd backend && npm install` completes without errors
- [ ] `cd backend && npm run typecheck` passes with no errors
- [ ] `cd backend && npm run lint` passes
- [ ] `cd backend && npm run dev` starts server without crashing

#### Manual Verification:
- [ ] `curl http://localhost:3001/api/health` returns `{"status":"ok"}`
- [ ] `curl -X POST http://localhost:3001/api/session` returns a sessionId
- [ ] SSE connection can be established (test with browser/curl)

---

## Phase 2: Middleware System & TodoMiddleware

### Overview
Implement the core middleware architecture and the TodoMiddleware that provides planning capabilities (write_todos, read_todos).

### Changes Required:

#### 1. Middleware Interface
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

#### 2. MiddlewareManager
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

#### 3. TodoMiddleware
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

#### 4. Export middleware
**File**: `backend/src/middleware/index.ts`

```typescript
export * from './types.js';
export * from './MiddlewareManager.js';
export * from './TodoMiddleware.js';
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd backend && npm run typecheck` passes
- [ ] `cd backend && npm run lint` passes

#### Manual Verification:
- [ ] MiddlewareManager can register TodoMiddleware
- [ ] `composeSystemPrompt()` returns combined prompts
- [ ] Todo tools are registered in ToolRegistry

---

## Phase 3: FilesystemMiddleware

### Overview
Implement file operations (read_file, write_file, edit_file, list_directory) and shell execution with path safety validation.

### Changes Required:

#### 1. FilesystemMiddleware
**File**: `backend/src/middleware/FilesystemMiddleware.ts`

```typescript
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { Middleware } from './types.js';
import { ToolDefinition, ToolContext, ToolResult } from '../tools/ToolRegistry.js';

const ReadFileSchema = z.object({
  path: z.string().describe('Absolute path to the file to read'),
});

const WriteFileSchema = z.object({
  path: z.string().describe('Absolute path to the file to write'),
  content: z.string().describe('Content to write to the file'),
});

const EditFileSchema = z.object({
  path: z.string().describe('Absolute path to the file to edit'),
  old_string: z.string().describe('The exact string to find and replace'),
  new_string: z.string().describe('The string to replace it with'),
});

const ListDirectorySchema = z.object({
  path: z.string().describe('Absolute path to the directory to list'),
});

const ExecuteShellSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  cwd: z.string().optional().describe('Working directory for the command'),
});

export class FilesystemMiddleware implements Middleware {
  name = 'FilesystemMiddleware';
  private allowedPaths: string[];

  constructor(allowedPaths: string[] = [process.cwd()]) {
    this.allowedPaths = allowedPaths.map(p => path.resolve(p));
  }

  systemPrompt = `## File Operations
You have access to file system tools for reading, writing, and editing files.
- Always check if files exist before writing (use list_directory)
- Use edit_file for modifications to existing files
- Use write_file for creating new files
- Prefer small, focused file operations
- Use absolute paths

## Shell Execution
You can execute shell commands with execute_shell.
- Use for running tests, builds, and other development tasks
- Avoid destructive commands (rm -rf, etc.)
- Check command output for errors`;

  private validatePath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    return this.allowedPaths.some(allowed => resolved.startsWith(allowed));
  }

  tools: ToolDefinition[] = [
    {
      name: 'read_file',
      description: 'Read the contents of a file',
      inputSchema: ReadFileSchema,
      execute: async (input: z.infer<typeof ReadFileSchema>, context: ToolContext): Promise<ToolResult> => {
        if (!this.validatePath(input.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'read_file', summary: `Reading ${input.path}` });
          const content = await fs.readFile(input.path, 'utf-8');
          context.emit('tool_complete', { name: 'read_file', success: true });
          return { success: true, output: content };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'read_file', success: false });
          return { success: false, output: '', error };
        }
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file (creates or overwrites)',
      inputSchema: WriteFileSchema,
      execute: async (input: z.infer<typeof WriteFileSchema>, context: ToolContext): Promise<ToolResult> => {
        if (!this.validatePath(input.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'write_file', summary: `Writing ${input.path}` });

          // Ensure directory exists
          await fs.mkdir(path.dirname(input.path), { recursive: true });
          await fs.writeFile(input.path, input.content, 'utf-8');

          context.emit('tool_complete', { name: 'write_file', success: true });
          return { success: true, output: `Successfully wrote to ${input.path}` };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'write_file', success: false });
          return { success: false, output: '', error };
        }
      },
    },
    {
      name: 'edit_file',
      description: 'Edit a file by replacing a specific string',
      inputSchema: EditFileSchema,
      execute: async (input: z.infer<typeof EditFileSchema>, context: ToolContext): Promise<ToolResult> => {
        if (!this.validatePath(input.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'edit_file', summary: `Editing ${input.path}` });

          const content = await fs.readFile(input.path, 'utf-8');

          if (!content.includes(input.old_string)) {
            context.emit('tool_complete', { name: 'edit_file', success: false });
            return { success: false, output: '', error: 'old_string not found in file' };
          }

          const newContent = content.replace(input.old_string, input.new_string);
          await fs.writeFile(input.path, newContent, 'utf-8');

          context.emit('tool_complete', { name: 'edit_file', success: true });
          return { success: true, output: `Successfully edited ${input.path}` };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'edit_file', success: false });
          return { success: false, output: '', error };
        }
      },
    },
    {
      name: 'list_directory',
      description: 'List contents of a directory',
      inputSchema: ListDirectorySchema,
      execute: async (input: z.infer<typeof ListDirectorySchema>, context: ToolContext): Promise<ToolResult> => {
        if (!this.validatePath(input.path)) {
          return { success: false, output: '', error: 'Path outside allowed directories' };
        }

        try {
          context.emit('tool_start', { name: 'list_directory', summary: `Listing ${input.path}` });

          const entries = await fs.readdir(input.path, { withFileTypes: true });
          const listing = entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
          }));

          context.emit('tool_complete', { name: 'list_directory', success: true });
          return { success: true, output: JSON.stringify(listing, null, 2) };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('tool_complete', { name: 'list_directory', success: false });
          return { success: false, output: '', error };
        }
      },
    },
    {
      name: 'execute_shell',
      description: 'Execute a shell command',
      inputSchema: ExecuteShellSchema,
      execute: async (input: z.infer<typeof ExecuteShellSchema>, context: ToolContext): Promise<ToolResult> => {
        // Basic safety check - block dangerous commands
        const dangerous = ['rm -rf /', 'rm -rf ~', 'mkfs', 'dd if=', ':(){:|:&};:'];
        if (dangerous.some(d => input.command.includes(d))) {
          return { success: false, output: '', error: 'Command blocked for safety' };
        }

        const cwd = input.cwd || context.workingDirectory;
        if (!this.validatePath(cwd)) {
          return { success: false, output: '', error: 'Working directory outside allowed paths' };
        }

        try {
          context.emit('tool_start', { name: 'execute_shell', summary: `Running: ${input.command}` });

          const result = await execa(input.command, {
            shell: true,
            cwd,
            timeout: 60000, // 60 second timeout
          });

          context.emit('tool_complete', { name: 'execute_shell', success: true });
          return {
            success: true,
            output: result.stdout + (result.stderr ? '\n' + result.stderr : ''),
          };
        } catch (err: any) {
          context.emit('tool_complete', { name: 'execute_shell', success: false });
          return {
            success: false,
            output: err.stdout || '',
            error: err.stderr || err.message,
          };
        }
      },
    },
  ];
}
```

#### 2. Update middleware exports
**File**: `backend/src/middleware/index.ts`

```typescript
export * from './types.js';
export * from './MiddlewareManager.js';
export * from './TodoMiddleware.js';
export * from './FilesystemMiddleware.js';
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd backend && npm run typecheck` passes
- [ ] `cd backend && npm run lint` passes

#### Manual Verification:
- [ ] File read/write operations work correctly
- [ ] Path validation blocks traversal attacks
- [ ] Shell execution works with timeout
- [ ] Dangerous commands are blocked

---

## Phase 4: Agent Orchestrator & Context Management

### Overview
Implement the main agent loop (Orchestrator), context token tracking (ContextManager), and checkpoint system (CheckpointManager).

### Changes Required:

#### 1. ContextManager
**File**: `backend/src/agent/ContextManager.ts`

```typescript
export interface ContextUsage {
  tokens: number;
  percentage: number;
  warning: boolean;
}

export class ContextManager {
  private maxTokens: number;
  private softLimitPercent: number;
  private warnPercent: number;

  constructor(maxTokens = 200000, softLimitPercent = 40, warnPercent = 32) {
    this.maxTokens = maxTokens;
    this.softLimitPercent = softLimitPercent;
    this.warnPercent = warnPercent;
  }

  // Simple token estimation (characters / 4)
  // In production, use @anthropic-ai/tokenizer
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  calculateUsage(messages: Array<{ role: string; content: any }>): ContextUsage {
    let totalTokens = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalTokens += this.estimateTokens(message.content);
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.text) {
            totalTokens += this.estimateTokens(block.text);
          } else if (block.content) {
            totalTokens += this.estimateTokens(block.content);
          }
        }
      }
    }

    const percentage = (totalTokens / this.maxTokens) * 100;
    const warning = percentage >= this.warnPercent;

    return { tokens: totalTokens, percentage, warning };
  }

  isAtSoftLimit(usage: ContextUsage): boolean {
    return usage.percentage >= this.softLimitPercent;
  }

  getSoftLimit(): number {
    return this.softLimitPercent;
  }
}
```

#### 2. CheckpointManager
**File**: `backend/src/agent/CheckpointManager.ts`

```typescript
import { v4 as uuidv4 } from 'uuid';
import { AgentState, Checkpoint, Todo } from '../middleware/types.js';

export class CheckpointManager {
  private checkpoints = new Map<string, Map<string, Checkpoint>>();

  createCheckpoint(state: AgentState): string {
    const checkpointId = uuidv4();

    // Deep clone the state
    const checkpoint: Checkpoint = {
      id: checkpointId,
      timestamp: Date.now(),
      state: {
        ...state,
        messages: JSON.parse(JSON.stringify(state.messages)),
        todos: JSON.parse(JSON.stringify(state.todos)),
        files: new Map(state.files),
        checkpoints: new Map(), // Don't nest checkpoints
        contextUsage: { ...state.contextUsage },
      },
    };

    if (!this.checkpoints.has(state.sessionId)) {
      this.checkpoints.set(state.sessionId, new Map());
    }
    this.checkpoints.get(state.sessionId)!.set(checkpointId, checkpoint);

    return checkpointId;
  }

  getCheckpoint(sessionId: string, checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.get(sessionId)?.get(checkpointId);
  }

  listCheckpoints(sessionId: string): Array<{ id: string; timestamp: number }> {
    const sessionCheckpoints = this.checkpoints.get(sessionId);
    if (!sessionCheckpoints) return [];

    return Array.from(sessionCheckpoints.values())
      .map(c => ({ id: c.id, timestamp: c.timestamp }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  revertToCheckpoint(sessionId: string, checkpointId: string): AgentState | null {
    const checkpoint = this.getCheckpoint(sessionId, checkpointId);
    if (!checkpoint) return null;

    // Return a clone of the checkpoint state
    return {
      ...checkpoint.state,
      messages: JSON.parse(JSON.stringify(checkpoint.state.messages)),
      todos: JSON.parse(JSON.stringify(checkpoint.state.todos)),
      files: new Map(checkpoint.state.files),
      checkpoints: this.checkpoints.get(sessionId) || new Map(),
      contextUsage: { ...checkpoint.state.contextUsage },
    };
  }

  forkFromCheckpoint(sessionId: string, checkpointId: string, newSessionId: string): AgentState | null {
    const state = this.revertToCheckpoint(sessionId, checkpointId);
    if (!state) return null;

    state.sessionId = newSessionId;
    return state;
  }
}
```

#### 3. AgentOrchestrator
**File**: `backend/src/agent/Orchestrator.ts`

```typescript
import { MiddlewareManager } from '../middleware/MiddlewareManager.js';
import { AgentState } from '../middleware/types.js';
import { ToolContext } from '../tools/ToolRegistry.js';
import { LLMClient, ContentBlock } from './LLMClient.js';
import { ContextManager } from './ContextManager.js';
import { CheckpointManager } from './CheckpointManager.js';

export interface OrchestratorConfig {
  workingDirectory: string;
  emit: (event: string, data: any) => void;
}

export class Orchestrator {
  private middlewareManager: MiddlewareManager;
  private llmClient: LLMClient;
  private contextManager: ContextManager;
  private checkpointManager: CheckpointManager;
  private states = new Map<string, AgentState>();

  constructor(
    middlewareManager: MiddlewareManager,
    llmClient: LLMClient,
    contextManager: ContextManager,
    checkpointManager: CheckpointManager
  ) {
    this.middlewareManager = middlewareManager;
    this.llmClient = llmClient;
    this.contextManager = contextManager;
    this.checkpointManager = checkpointManager;
  }

  getOrCreateState(sessionId: string): AgentState {
    if (!this.states.has(sessionId)) {
      this.states.set(sessionId, {
        sessionId,
        messages: [],
        todos: [],
        files: new Map(),
        checkpoints: new Map(),
        contextUsage: { tokens: 0, percentage: 0 },
      });
    }
    return this.states.get(sessionId)!;
  }

  async processMessage(
    sessionId: string,
    userMessage: string,
    config: OrchestratorConfig
  ): Promise<void> {
    let state = this.getOrCreateState(sessionId);

    // Add user message
    state.messages.push({ role: 'user', content: userMessage });

    // Create checkpoint before processing
    const checkpointId = this.checkpointManager.createCheckpoint(state);
    config.emit('checkpoint_created', { id: checkpointId });

    // Run before hooks
    state = await this.middlewareManager.runBeforeHooks(state);

    const systemPrompt = this.middlewareManager.composeSystemPrompt();
    const toolRegistry = this.middlewareManager.getToolRegistry();
    const tools = toolRegistry.getToolSchemas();

    const toolContext: ToolContext = {
      sessionId,
      workingDirectory: config.workingDirectory,
      emit: config.emit,
    };

    // Agent loop - continue until no more tool calls
    let continueLoop = true;
    while (continueLoop) {
      continueLoop = false;

      // Collect streamed response
      let textContent = '';
      const toolCalls: Array<{ id: string; name: string; input: string }> = [];
      let currentToolCall: { id: string; name: string; input: string } | null = null;

      for await (const event of this.llmClient.streamMessage(
        systemPrompt,
        state.messages,
        tools
      )) {
        if (event.type === 'text' && event.text) {
          textContent += event.text;
          config.emit('text', { content: event.text });
        } else if (event.type === 'tool_use') {
          if (event.id && event.name) {
            // New tool call starting
            currentToolCall = { id: event.id, name: event.name, input: '' };
          } else if (event.text && currentToolCall) {
            // Accumulating tool input JSON
            currentToolCall.input += event.text;
          }
        } else if (event.type === 'content_block_stop' && currentToolCall) {
          toolCalls.push(currentToolCall);
          currentToolCall = null;
        }
      }

      // Build assistant message content
      const assistantContent: ContentBlock[] = [];
      if (textContent) {
        assistantContent.push({ type: 'text', text: textContent });
      }

      // Process tool calls
      if (toolCalls.length > 0) {
        continueLoop = true;

        for (const tc of toolCalls) {
          assistantContent.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.input || '{}'),
          });
        }

        // Add assistant message with tool calls
        state.messages.push({ role: 'assistant', content: assistantContent });

        // Execute tools and collect results
        const toolResults: ContentBlock[] = [];
        for (const tc of toolCalls) {
          const tool = toolRegistry.get(tc.name);
          if (tool) {
            const input = JSON.parse(tc.input || '{}');
            const result = await tool.execute(input, toolContext);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: result.success ? result.output : `Error: ${result.error}`,
            });
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: `Error: Unknown tool ${tc.name}`,
            });
          }
        }

        // Add tool results as user message
        state.messages.push({ role: 'user', content: toolResults });
      } else if (textContent) {
        // No tool calls, just text
        state.messages.push({ role: 'assistant', content: textContent });
      }

      // Update context usage
      state.contextUsage = this.contextManager.calculateUsage(state.messages);
      config.emit('context_update', state.contextUsage);
    }

    // Run after hooks
    state = await this.middlewareManager.runAfterHooks(state);
    this.states.set(sessionId, state);
  }

  revertToCheckpoint(sessionId: string, checkpointId: string): boolean {
    const state = this.checkpointManager.revertToCheckpoint(sessionId, checkpointId);
    if (state) {
      this.states.set(sessionId, state);
      return true;
    }
    return false;
  }

  forkFromCheckpoint(sessionId: string, checkpointId: string, newSessionId: string): boolean {
    const state = this.checkpointManager.forkFromCheckpoint(sessionId, checkpointId, newSessionId);
    if (state) {
      this.states.set(newSessionId, state);
      return true;
    }
    return false;
  }

  getCheckpoints(sessionId: string) {
    return this.checkpointManager.listCheckpoints(sessionId);
  }

  setModel(model: string): void {
    this.llmClient.setModel(model);
  }
}
```

#### 4. Export agent components
**File**: `backend/src/agent/index.ts`

```typescript
export * from './LLMClient.js';
export * from './ContextManager.js';
export * from './CheckpointManager.js';
export * from './Orchestrator.js';
```

#### 5. Update server with full routes
**File**: `backend/src/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { MiddlewareManager, TodoMiddleware, FilesystemMiddleware } from './middleware/index.js';
import { LLMClient, ContextManager, CheckpointManager, Orchestrator } from './agent/index.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize components
const middlewareManager = new MiddlewareManager();
const todoMiddleware = new TodoMiddleware();
const filesystemMiddleware = new FilesystemMiddleware([process.cwd()]);

middlewareManager.register(todoMiddleware);
middlewareManager.register(filesystemMiddleware);

const llmClient = new LLMClient();
const contextManager = new ContextManager();
const checkpointManager = new CheckpointManager();
const orchestrator = new Orchestrator(
  middlewareManager,
  llmClient,
  contextManager,
  checkpointManager
);

// Store active SSE connections
const connections = new Map<string, express.Response>();

// SSE endpoint
app.get('/api/events/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  connections.set(sessionId, res);

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`);

  req.on('close', () => {
    connections.delete(sessionId);
  });
});

// Helper to emit SSE events
function emitEvent(sessionId: string, event: string, data: any): void {
  const connection = connections.get(sessionId);
  if (connection) {
    connection.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Create new session
app.post('/api/session', (req, res) => {
  const sessionId = uuidv4();
  res.json({ sessionId });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, model } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message required' });
  }

  if (model) {
    orchestrator.setModel(model);
  }

  try {
    await orchestrator.processMessage(sessionId, message, {
      workingDirectory: process.cwd(),
      emit: (event, data) => emitEvent(sessionId, event, data),
    });

    res.json({ status: 'completed' });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    emitEvent(sessionId, 'error', { error });
    res.status(500).json({ error });
  }
});

// Get todos for session
app.get('/api/todos/:sessionId', (req, res) => {
  const todos = todoMiddleware.getTodos(req.params.sessionId);
  res.json({ todos });
});

// Get checkpoints for session
app.get('/api/checkpoints/:sessionId', (req, res) => {
  const checkpoints = orchestrator.getCheckpoints(req.params.sessionId);
  res.json({ checkpoints });
});

// Revert to checkpoint
app.post('/api/revert', (req, res) => {
  const { sessionId, checkpointId } = req.body;

  if (!sessionId || !checkpointId) {
    return res.status(400).json({ error: 'sessionId and checkpointId required' });
  }

  const success = orchestrator.revertToCheckpoint(sessionId, checkpointId);
  if (success) {
    emitEvent(sessionId, 'reverted', { checkpointId });
    res.json({ status: 'reverted' });
  } else {
    res.status(404).json({ error: 'Checkpoint not found' });
  }
});

// Fork from checkpoint
app.post('/api/fork', (req, res) => {
  const { sessionId, checkpointId } = req.body;

  if (!sessionId || !checkpointId) {
    return res.status(400).json({ error: 'sessionId and checkpointId required' });
  }

  const newSessionId = uuidv4();
  const success = orchestrator.forkFromCheckpoint(sessionId, checkpointId, newSessionId);
  if (success) {
    res.json({ newSessionId });
  } else {
    res.status(404).json({ error: 'Checkpoint not found' });
  }
});

// Set model
app.post('/api/model', (req, res) => {
  const { model } = req.body;
  if (!model) {
    return res.status(400).json({ error: 'model required' });
  }
  orchestrator.setModel(model);
  res.json({ status: 'updated', model });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd backend && npm run typecheck` passes
- [ ] `cd backend && npm run lint` passes
- [ ] `cd backend && npm run dev` starts without errors

#### Manual Verification:
- [ ] POST /api/chat with a simple message streams response via SSE
- [ ] Todo updates appear in SSE stream when agent uses write_todos
- [ ] Context percentage is calculated and emitted
- [ ] Checkpoints are created and can be listed

---

## Phase 5: SubAgentMiddleware

### Overview
Implement the spawn_subtask tool that creates isolated sub-agent conversations with their own context window.

### Changes Required:

#### 1. SubAgentMiddleware
**File**: `backend/src/middleware/SubAgentMiddleware.ts`

```typescript
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { Middleware } from './types.js';
import { ToolDefinition, ToolContext, ToolResult, ToolRegistry } from '../tools/ToolRegistry.js';

const SpawnSubtaskSchema = z.object({
  prompt: z.string().describe('Clear, specific instructions for the subtask'),
  allowedTools: z.array(z.string()).optional().describe('List of tool names the subtask can use. Defaults to file tools only.'),
  maxTokens: z.number().optional().describe('Maximum tokens for subtask response. Defaults to 4096.'),
});

interface SubtaskResult {
  summary: string;
  filesCreated: string[];
  filesModified: string[];
  success: boolean;
}

export class SubAgentMiddleware implements Middleware {
  name = 'SubAgentMiddleware';
  private client: Anthropic;
  private model: string;
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry, model = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic();
    this.model = model;
    this.toolRegistry = toolRegistry;
  }

  systemPrompt = `## Sub-task Delegation
You can spawn isolated subtasks using spawn_subtask for well-defined, focused work.
- Subtasks have their own context window (no access to your conversation history)
- Use for: research, boilerplate generation, testing, isolated file operations
- Provide clear, specific prompts with all necessary context
- Subtasks return a summary of their work

Best practices:
- Only delegate truly independent work
- Include all context the subtask needs in the prompt
- Keep subtask scope narrow and focused`;

  tools: ToolDefinition[] = [
    {
      name: 'spawn_subtask',
      description: 'Spawn an isolated subtask with its own context window. Use for focused, well-defined work that does not need your conversation history.',
      inputSchema: SpawnSubtaskSchema,
      execute: async (input: z.infer<typeof SpawnSubtaskSchema>, context: ToolContext): Promise<ToolResult> => {
        const subtaskId = uuidv4();
        const allowedTools = input.allowedTools || ['read_file', 'write_file', 'edit_file', 'list_directory'];
        const maxTokens = input.maxTokens || 4096;

        context.emit('subtask_start', { id: subtaskId, prompt: input.prompt });

        try {
          const result = await this.executeSubtask(
            input.prompt,
            allowedTools,
            maxTokens,
            context
          );

          context.emit('subtask_complete', { id: subtaskId, ...result });

          return {
            success: result.success,
            output: JSON.stringify(result, null, 2),
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          context.emit('subtask_complete', { id: subtaskId, success: false, error });
          return { success: false, output: '', error };
        }
      },
    },
  ];

  private async executeSubtask(
    prompt: string,
    allowedToolNames: string[],
    maxTokens: number,
    context: ToolContext
  ): Promise<SubtaskResult> {
    const filesCreated: string[] = [];
    const filesModified: string[] = [];

    // Get allowed tools from registry
    const allowedTools = allowedToolNames
      .map(name => this.toolRegistry.get(name))
      .filter((t): t is ToolDefinition => t !== undefined);

    const toolSchemas = allowedTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: this.zodToJsonSchema(tool.inputSchema),
    }));

    const subtaskSystemPrompt = `You are a focused assistant completing a specific subtask.
Complete the task efficiently and report your results.
You have access to file tools for reading and writing files.
Work within the scope of the task - do not expand beyond what is asked.`;

    const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [
      { role: 'user', content: prompt },
    ];

    // Subtask agent loop
    let continueLoop = true;
    let iterations = 0;
    const maxIterations = 10;

    while (continueLoop && iterations < maxIterations) {
      iterations++;
      continueLoop = false;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: subtaskSystemPrompt,
        messages,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      });

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length > 0) {
        continueLoop = true;
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

        for (const toolUse of toolUseBlocks) {
          const tool = allowedTools.find(t => t.name === toolUse.name);
          if (tool) {
            const result = await tool.execute(toolUse.input, context);

            // Track file operations
            if (toolUse.name === 'write_file' && result.success) {
              filesCreated.push((toolUse.input as any).path);
            } else if (toolUse.name === 'edit_file' && result.success) {
              filesModified.push((toolUse.input as any).path);
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result.success ? result.output : `Error: ${result.error}`,
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
      } else {
        // Extract final text response
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );

        return {
          summary: textBlock?.text || 'Subtask completed',
          filesCreated,
          filesModified,
          success: true,
        };
      }
    }

    return {
      summary: 'Subtask completed (max iterations reached)',
      filesCreated,
      filesModified,
      success: true,
    };
  }

  private zodToJsonSchema(schema: z.ZodType<any>): object {
    // Same implementation as ToolRegistry
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodType<any>);
        if (!(value as any).isOptional()) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    if (schema instanceof z.ZodString) return { type: 'string' };
    if (schema instanceof z.ZodNumber) return { type: 'number' };
    if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
    if (schema instanceof z.ZodArray) {
      return { type: 'array', items: this.zodToJsonSchema(schema.element) };
    }
    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap());
    }

    return { type: 'string' };
  }

  setModel(model: string): void {
    this.model = model;
  }
}
```

#### 2. Update middleware exports
**File**: `backend/src/middleware/index.ts`

```typescript
export * from './types.js';
export * from './MiddlewareManager.js';
export * from './TodoMiddleware.js';
export * from './FilesystemMiddleware.js';
export * from './SubAgentMiddleware.js';
```

#### 3. Update server to use SubAgentMiddleware
**File**: `backend/src/index.ts` - Add SubAgentMiddleware registration

Add after FilesystemMiddleware registration:
```typescript
import { MiddlewareManager, TodoMiddleware, FilesystemMiddleware, SubAgentMiddleware } from './middleware/index.js';

// ... existing code ...

const subAgentMiddleware = new SubAgentMiddleware(middlewareManager.getToolRegistry());
middlewareManager.register(subAgentMiddleware);
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd backend && npm run typecheck` passes
- [ ] `cd backend && npm run lint` passes

#### Manual Verification:
- [ ] spawn_subtask tool appears in agent's available tools
- [ ] Subtask can be spawned and executes in isolated context
- [ ] Subtask results are returned to parent agent
- [ ] SSE events for subtask_start and subtask_complete are emitted

---

## Phase 6: React Frontend

### Overview
Create the React frontend with Vite, Tailwind CSS, and components for chat, todo list, tool status, context meter, and subtask indicator.

### Changes Required:

#### 1. Create frontend project
**Action**: Initialize Vite project with React and TypeScript

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

#### 2. Frontend package.json
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

#### 3. Tailwind configuration
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

#### 4. CSS with Tailwind
**File**: `frontend/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-900 text-gray-100;
}
```

#### 5. Types
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

#### 6. SSE Hook
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

#### 7. API Client
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

#### 8. ChatPanel Component
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

#### 9. TodoList Component
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

#### 10. ToolStatus Component
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

#### 11. SubTaskIndicator Component
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

#### 12. ContextMeter Component
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

#### 13. ModelSelector Component
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

#### 14. CheckpointControls Component
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

#### 15. Main App Component
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

#### 16. Vite config
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

### Success Criteria:

#### Automated Verification:
- [ ] `cd frontend && npm install` completes without errors
- [ ] `cd frontend && npm run typecheck` passes
- [ ] `cd frontend && npm run build` succeeds

#### Manual Verification:
- [ ] `npm run dev` starts frontend on http://localhost:5173
- [ ] UI displays correctly with header, chat panel, and sidebar
- [ ] Chat input accepts messages
- [ ] Todo list section is visible
- [ ] Context meter displays in header

---

## Phase 7: Integration & End-to-End Testing

### Overview
Wire everything together, fix any integration issues, and ensure the full flow works end-to-end.

### Changes Required:

#### 1. Fix streaming text finalization in App.tsx

The current implementation has a race condition with streaming text. Update the message handling:

```typescript
// In handleSendMessage, after api.sendMessage completes:
// We need to track the final message differently since streaming happens asynchronously

const handleSendMessage = async (content: string) => {
  if (!sessionId) return;

  setIsProcessing(true);
  const currentStreamingRef = { text: '' };
  setStreamingText('');
  setMessages(prev => [...prev, { role: 'user', content }]);

  try {
    await api.sendMessage(sessionId, content, model);
  } catch (err) {
    console.error('Failed to send message:', err);
  } finally {
    // Small delay to ensure all SSE events are processed
    setTimeout(() => {
      setMessages(prev => {
        // Only add assistant message if we have streaming text
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'user') {
          return [...prev, { role: 'assistant', content: streamingText || '(Task completed)' }];
        }
        return prev;
      });
      setStreamingText('');
      setIsProcessing(false);
    }, 100);
  }
};
```

#### 2. Add root package.json for convenience
**File**: `package.json` (root)

```json
{
  "name": "coding-agent",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "typecheck": "npm run typecheck:backend && npm run typecheck:frontend",
    "typecheck:backend": "cd backend && npm run typecheck",
    "typecheck:frontend": "cd frontend && npm run typecheck",
    "install:all": "npm install && cd backend && npm install && cd ../frontend && npm install"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

#### 3. Update backend CORS for development
**File**: `backend/src/index.ts` - Update CORS config

```typescript
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run install:all` installs all dependencies
- [ ] `npm run typecheck` passes for both backend and frontend
- [ ] `npm run build` succeeds for both projects

#### Manual Verification:
- [ ] Start backend with `npm run dev:backend`
- [ ] Start frontend with `npm run dev:frontend`
- [ ] Send a message like "Create a todo list with 3 items"
- [ ] Verify todo list updates in the UI in real-time
- [ ] Verify tool status shows tool executions
- [ ] Verify context meter updates
- [ ] Test file operations: "Create a file called test.txt with hello world"
- [ ] Verify the file is created
- [ ] Test checkpoint revert functionality

---

## Phase 8: Documentation

### Overview
Create comprehensive documentation including README, architecture docs, and AI usage documentation.

### Changes Required:

#### 1. Main README
**File**: `README.md`

```markdown
# TypeScript Coding Agent

A TypeScript-based AI coding agent that runs locally with a web UI, implementing the four principles identified in deep agent research for handling long-horizon tasks.

## Features

- **Planning Tool** - Todo list management for task tracking
- **Filesystem Access** - File operations with path safety
- **Sub-agent Delegation** - Isolated subtasks with separate context
- **Real-time Streaming** - SSE-based live updates to UI
- **Checkpoint System** - Revert and fork conversation states
- **Context Monitoring** - Token usage tracking with warnings

## Quick Start

### Prerequisites

- Node.js 18+
- Anthropic API key

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd coding-agent

# Install all dependencies
npm run install:all

# Set your API key
export ANTHROPIC_API_KEY=your_key_here
```

### Running

```bash
# Start both backend and frontend
npm run dev

# Or start separately:
npm run dev:backend  # http://localhost:3001
npm run dev:frontend # http://localhost:5173
```

## Architecture

### The Four Principles

This agent implements patterns identified in successful long-horizon agents like Claude Code:

1. **Planning Tool**: TodoMiddleware provides `write_todos` and `read_todos` for persistent task tracking
2. **Filesystem Access**: FilesystemMiddleware enables context offloading via file operations
3. **Sub-agent Delegation**: SubAgentMiddleware spawns isolated agents with fresh context windows
4. **Detailed Prompting**: Each middleware contributes guidance to the system prompt

### Middleware Pipeline

```
MiddlewareManager
  ├── TodoMiddleware      (write_todos, read_todos)
  ├── FilesystemMiddleware (read_file, write_file, edit_file, list_directory, execute_shell)
  └── SubAgentMiddleware   (spawn_subtask)
```

### SSE Events

| Event | Data | Description |
|-------|------|-------------|
| text | { content } | Streaming text from agent |
| tool_start | { name, summary } | Tool execution started |
| tool_complete | { name, success } | Tool execution finished |
| todo_update | { todos } | Todo list changed |
| subtask_start | { id, prompt } | Subtask spawned |
| subtask_complete | { id, success, summary } | Subtask finished |
| context_update | { tokens, percentage } | Context usage changed |

## API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/session | Create new session |
| POST | /api/chat | Send message to agent |
| GET | /api/events/:sessionId | SSE event stream |
| GET | /api/todos/:sessionId | Get current todos |
| GET | /api/checkpoints/:sessionId | List checkpoints |
| POST | /api/revert | Revert to checkpoint |
| POST | /api/fork | Fork from checkpoint |
| POST | /api/model | Change LLM model |

## Project Structure

```
coding-agent/
├── backend/
│   ├── src/
│   │   ├── middleware/      # Middleware system
│   │   ├── agent/           # Orchestrator, context, checkpoints
│   │   ├── tools/           # Tool registry
│   │   └── index.ts         # Express server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom hooks (SSE)
│   │   └── App.tsx          # Main app
│   └── package.json
└── README.md
```

## Development

### Type Checking

```bash
npm run typecheck
```

### Building

```bash
npm run build
```

## Future Enhancements

Based on the four principles, these features were documented but not implemented for the MVP:

- [ ] SummarizationMiddleware - Auto-compress at 85% context
- [ ] PatchToolCallsMiddleware - Repair interrupted tool calls
- [ ] Parallel subtasks
- [ ] Persistent backend storage
- [ ] Semantic code search
- [ ] LSP integration

## Acknowledgments

- Architecture inspired by Claude Code and DeepAgents research
- Four principles from METR research on agent task horizons
```

#### 2. Architecture Documentation
**File**: `docs/ARCHITECTURE.md`

```markdown
# Architecture Documentation

## Overview

The coding agent follows a middleware-based architecture where each capability is encapsulated in a middleware component. This design provides:

- **Modularity**: Each feature is self-contained
- **Extensibility**: New features are added by registering new middleware
- **Composability**: Middleware can be combined in different configurations

## Core Components

### MiddlewareManager

The central coordinator that:
- Registers middleware in order
- Composes system prompts from all middleware
- Manages the tool registry
- Runs before/after hooks

### Orchestrator

The main agent loop that:
- Manages conversation state per session
- Calls the LLM with composed prompts
- Executes tool calls
- Handles checkpoints

### ContextManager

Monitors context window usage:
- Estimates token counts
- Tracks percentage of max tokens
- Warns at 32%, soft limit at 40%

### CheckpointManager

Provides state snapshots:
- Creates checkpoints before each turn
- Supports revert to previous state
- Supports fork to new session

## Middleware Components

### TodoMiddleware

Implements the Planning Tool principle:
- `write_todos`: Replace entire todo list
- `read_todos`: Get current state
- In-memory storage per session
- Emits `todo_update` SSE events

### FilesystemMiddleware

Implements the Filesystem Access principle:
- `read_file`: Read file contents
- `write_file`: Create/overwrite files
- `edit_file`: String replacement edits
- `list_directory`: Directory listing
- `execute_shell`: Run shell commands
- Path validation prevents traversal attacks

### SubAgentMiddleware

Implements the Sub-agent Delegation principle:
- `spawn_subtask`: Create isolated agent
- Fresh context window (no history pollution)
- Configurable tool access
- Returns summary to parent

## Data Flow

```
User Message
    │
    ▼
┌──────────────────┐
│  Orchestrator    │
│  - Add to state  │
│  - Create ckpt   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ beforeInvoke()   │ ◄── Each middleware
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   LLM Call       │
│  - System prompt │
│  - Messages      │
│  - Tools         │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  Text     Tool Use
    │         │
    │    ┌────┴────┐
    │    │ Execute │
    │    │  Tool   │
    │    └────┬────┘
    │         │
    │    Tool Result
    │         │
    │    ┌────┴────┐
    │    │ More    │──▶ Loop
    │    │ calls?  │
    │    └────┬────┘
    │         │ No
    ▼         ▼
┌──────────────────┐
│ afterInvoke()    │
└────────┬─────────┘
         │
         ▼
    SSE Events
```

## System Prompt Composition

Each middleware contributes a section:

```
┌─────────────────────────────────────┐
│         CORE_IDENTITY               │
│  "You are a skilled software..."    │
├─────────────────────────────────────┤
│      TodoMiddleware.systemPrompt    │
│  "## Todo List (Planning Tool)..."  │
├─────────────────────────────────────┤
│   FilesystemMiddleware.systemPrompt │
│  "## File Operations..."            │
├─────────────────────────────────────┤
│   SubAgentMiddleware.systemPrompt   │
│  "## Sub-task Delegation..."        │
├─────────────────────────────────────┤
│         TASK_GUIDANCE               │
│  "## General Guidelines..."         │
└─────────────────────────────────────┘
```

## SSE Event System

Events flow from backend to frontend:

```
Backend                           Frontend
   │                                  │
   │  event: text                     │
   │  data: {"content":"Hello"}       │
   ├─────────────────────────────────►│
   │                                  │ Update streamingText
   │  event: tool_start               │
   │  data: {"name":"write_file"...}  │
   ├─────────────────────────────────►│
   │                                  │ Add to tools array
   │  event: todo_update              │
   │  data: {"todos":[...]}           │
   ├─────────────────────────────────►│
   │                                  │ Replace todos state
```
```

### Success Criteria:

#### Automated Verification:
- [ ] README.md exists with setup instructions
- [ ] docs/ARCHITECTURE.md exists with technical details

#### Manual Verification:
- [ ] README instructions work for fresh setup
- [ ] Architecture diagrams are accurate
- [ ] All API endpoints are documented

---

## Testing Strategy

### Unit Tests (Future Enhancement)

- ToolRegistry: Tool registration, schema conversion
- ContextManager: Token estimation, threshold detection
- CheckpointManager: Create, revert, fork operations
- Each middleware's tool execution

### Integration Tests (Manual for MVP)

1. **Basic chat flow**: Send message, receive streamed response
2. **Todo operations**: Agent creates and updates todos
3. **File operations**: Agent reads, writes, edits files
4. **Subtask delegation**: Agent spawns and receives subtask results
5. **Checkpoint system**: Create, list, revert, fork checkpoints

### Manual Testing Checklist

1. Start fresh session
2. Send: "Create a todo list with 3 items for building a REST API"
3. Verify todos appear in sidebar
4. Send: "Start working on the first task"
5. Verify todo status updates to in_progress
6. Send: "Create a file called server.js with a basic Express server"
7. Verify file is created (check filesystem)
8. Send: "Spawn a subtask to add error handling to server.js"
9. Verify subtask indicator appears and completes
10. Test revert to earlier checkpoint
11. Verify state is restored

---

## References

- Original PRD: `docs/prd.md`
- DeepAgents Research: `docs/DeepAgents_Harness_Documentation.md`
- Four Principles: Planning, Filesystem, Sub-agents, Detailed Prompting
