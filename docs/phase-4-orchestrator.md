# Phase 4: Agent Orchestrator & Context Management

## Overview

Implement the main agent loop (Orchestrator), context token tracking (ContextManager), and checkpoint system (CheckpointManager).

## Prerequisites

- Phases 1-3 completed successfully
- Middleware system with Todo and Filesystem middleware working

---

## Changes Required

### 1. ContextManager

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

### 2. CheckpointManager

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

### 3. AgentOrchestrator

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

### 4. Export Agent Components

**File**: `backend/src/agent/index.ts`

```typescript
export * from './LLMClient.js';
export * from './ContextManager.js';
export * from './CheckpointManager.js';
export * from './Orchestrator.js';
```

### 5. Update Server with Full Routes

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

---

## Success Criteria

### Automated Verification
- [ ] `cd backend && npm run typecheck` passes
- [ ] `cd backend && npm run lint` passes
- [ ] `cd backend && npm run dev` starts without errors

### Manual Verification
- [ ] POST /api/chat with a simple message streams response via SSE
- [ ] Todo updates appear in SSE stream when agent uses write_todos
- [ ] Context percentage is calculated and emitted via context_update event
- [ ] Checkpoints are created automatically and can be listed via GET /api/checkpoints/:sessionId
- [ ] Revert endpoint restores previous state
- [ ] Fork endpoint creates new session with copied state

---

## Next Phase

Once all success criteria are met, proceed to [Phase 5: SubAgentMiddleware](./phase-5-subagent.md).
