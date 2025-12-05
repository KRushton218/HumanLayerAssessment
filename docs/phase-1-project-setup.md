# Phase 1: Project Setup & Core Backend Infrastructure

## Overview

Set up the project structure, TypeScript configuration, dependencies, and core backend infrastructure including the Express server with SSE support and the foundational tool registry.

## Changes Required

### 1. Create Project Structure

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

### 2. Backend package.json

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

### 3. TypeScript Configuration

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

### 4. Tool Registry

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

### 5. LLM Client

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

### 6. Express Server with SSE

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

### 7. ESLint Configuration

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

---

## Success Criteria

### Automated Verification
- [ ] `cd backend && npm install` completes without errors
- [ ] `cd backend && npm run typecheck` passes with no errors
- [ ] `cd backend && npm run lint` passes
- [ ] `cd backend && npm run dev` starts server without crashing

### Manual Verification
- [ ] `curl http://localhost:3001/api/health` returns `{"status":"ok"}`
- [ ] `curl -X POST http://localhost:3001/api/session` returns a sessionId
- [ ] SSE connection can be established (test with browser/curl)

---

## Next Phase

Once all success criteria are met, proceed to [Phase 2: Middleware System & TodoMiddleware](./phase-2-middleware-todo.md).
