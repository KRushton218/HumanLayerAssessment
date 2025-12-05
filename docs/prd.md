# HumanLayer TypeScript Coding Agent - Revised PRD

## Executive Summary

Build a TypeScript-based AI coding agent that runs locally with a web UI, implementing the **four principles** identified in deep agent research for handling long-horizon tasks. The architecture uses a middleware-based design for extensibility. Time budget: 6 hours maximum.

### The Four Principles (Research Foundation)

| Principle | Implementation | Priority |
|-----------|----------------|----------|
| **Planning Tool** | TodoManager with write_todos/read_todos | MVP |
| **Filesystem Access** | File tools with context offloading | MVP |
| **Sub-agent Delegation** | Task spawning with isolated context | MVP (simplified) |
| **Detailed Prompting** | Structured system prompts per component | MVP |

---

## Hard Requirements (Must Have)

### Technical Stack

- **Language**: TypeScript for frontend AND backend
- **Runtime**: Local execution (localhost)
- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Streaming**: Server-Sent Events (CRITICAL requirement)

### Core Capabilities

- Tool streaming - MUST stream tool execution to UI in real-time
- **Planning tools** - write_todos, read_todos for persistent task tracking
- File operations - read_file, write_file, edit_file, list_directory
- Shell execution - execute shell commands with basic safety
- **Sub-task delegation** - spawn isolated sub-agents for complex tasks
- Chat interface - Text-based conversation

### Prohibited

- Any coding agent SDKs (Claude Code, Cursor, etc.)
- Paid services except LLM API keys
- Agent binaries or source as dependencies

---

## MVP Feature Scope (6 Hours)

### Hour 1-2: Backend Core + Middleware Foundation

```typescript
// Core middleware architecture
MVP: MiddlewareManager
  - Sequential middleware pipeline
  - Tool injection per middleware
  - System prompt composition

MVP: TodoMiddleware (Planning Tool - Principle #1)
  - write_todos(todos: Todo[]) - persist task list
  - read_todos() - retrieve current state
  - In-memory storage with checkpoint support
  - Auto-injected system prompt guidance

MVP: ToolRegistry with Zod schemas
MVP: LLM client (Anthropic SDK)
MVP: Basic token counting
MVP: SSE endpoint setup
```

### Hour 2-3: Filesystem + Context Management

```typescript
MVP: FilesystemMiddleware (Principle #2)
  - read_file, write_file, edit_file, list_directory
  - Path validation (prevent traversal)
  - execute_shell with basic safety

MVP: ContextManager (Enhanced)
  - Token counting (@anthropic-ai/tokenizer)
  - Track usage vs 40% soft limit
  - Warn at 32%
  - STRETCH: Auto-summarization at 85% threshold

MVP: CheckpointManager
  - Message-level snapshots (in-memory Map)
  - Store: messages + todos + files
  - Support revert and fork
```

### Hour 3-4: Sub-agents + Frontend

```typescript
MVP: SubAgentMiddleware (Principle #3 - Simplified)
  - spawn_subtask(prompt: string, tools: string[])
  - Isolated context window (fresh conversation)
  - Returns summary to parent agent
  - Prevents main agent context pollution

MVP: React + Vite + Tailwind UI
  - Chat interface
  - Todo list display (live updates)
  - Tool status display (streaming)
  - Context usage meter
  - Sub-task indicator
```

### Hour 4-5: Features + Polish

```typescript
MVP: Fork/revert from checkpoints
MVP: Model selector
MVP: Error handling
MVP: Integration testing

STRETCH: PatchToolCallsMiddleware
  - Repair dangling tool calls from interruptions

STRETCH: HumanInTheLoopMiddleware
  - Configurable approval gates
```

### Hour 5-6: Documentation + Prompting

```typescript
MVP: Comprehensive README
MVP: Architecture documentation
MVP: AI usage documentation
MVP: System prompt documentation (Principle #4)
MVP: 5-minute demo video
```

---

## Architecture

### System Diagram (Middleware-Based)

```
Frontend (React)              Backend (Express + TS)
 - ChatPanel                   - MiddlewareManager
 - TodoList (live)               - TodoMiddleware
 - SubTaskIndicator              - FilesystemMiddleware
 - ToolStatus                    - SubAgentMiddleware
 - ContextMeter                  - ContextMiddleware (stretch)
 - SSE Client                  - AgentOrchestrator
        |                      - CheckpointManager
        +--------- SSE --------+
                   |
             LLM Providers
```

### Middleware Pipeline

```typescript
interface Middleware {
  name: string;
  tools: Tool[];
  systemPrompt: string;
  beforeInvoke?(state: AgentState): AgentState;
  afterInvoke?(state: AgentState): AgentState;
}

// Execution order (based on DeepAgents research)
const middlewarePipeline = [
  new TodoMiddleware(),        // Planning - track tasks
  new FilesystemMiddleware(),  // Storage - context offloading
  new SubAgentMiddleware(),    // Delegation - isolated execution
  // STRETCH: new SummarizationMiddleware(),
  // STRETCH: new PatchToolCallsMiddleware(),
];
```

### Core Components

**MiddlewareManager** (30 min) - NEW
- Register middleware in order
- Compose system prompts from all middleware
- Inject tools from all middleware
- Run beforeInvoke/afterInvoke hooks

**TodoMiddleware** (45 min) - NEW (Principle #1)
- Implements planning tool pattern
- Tools: write_todos, read_todos
- Persists across conversation
- System prompt guides proper usage

```typescript
interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// System prompt injection
const todoSystemPrompt = `
You have access to a todo list for tracking task progress.
- Use write_todos to update your task list when starting work
- Use read_todos to check current progress
- Mark tasks in_progress BEFORE starting work
- Mark tasks completed IMMEDIATELY after finishing
- Break complex tasks into subtasks
`;
```

**FilesystemMiddleware** (1.5 hours) - Enhanced (Principle #2)
- Tools: read_file, write_file, edit_file, list_directory, execute_shell
- Path validation prevents directory traversal
- Execute with progress callbacks
- Stream status via SSE

**SubAgentMiddleware** (1 hour) - NEW (Principle #3)
- Tool: spawn_subtask
- Creates isolated LLM conversation
- Fresh context window (no history pollution)
- Limited tool access (configurable)
- Returns summary to parent

```typescript
interface SpawnSubtaskParams {
  prompt: string;
  allowedTools?: string[];  // defaults to file tools only
  maxTokens?: number;       // defaults to 4096
}

// Returns structured result
interface SubtaskResult {
  summary: string;
  filesCreated: string[];
  filesModified: string[];
  success: boolean;
}
```

**AgentOrchestrator** (1 hour) - Simplified
- Main agent loop
- Delegates to middleware pipeline
- Calls LLM with composed system prompt
- Executes tool calls through registry

**ContextManager** (45 min) - Enhanced
- Count tokens (@anthropic-ai/tokenizer)
- Track usage vs 40% soft limit (main agent)
- Warn at 32%
- STRETCH: SummarizationMiddleware at 85%

**CheckpointManager** (45 min)
- Message-level snapshots (in-memory Map)
- Store: messages + todos + file snapshots
- Support revert and fork

---

## Prompting Strategy (Principle #4)

### System Prompt Composition

Each middleware contributes a section to the system prompt:

```typescript
const composeSystemPrompt = (middlewares: Middleware[]): string => {
  const sections = [
    CORE_IDENTITY,
    ...middlewares.map(m => m.systemPrompt),
    TASK_GUIDANCE,
  ];
  return sections.join('\n\n---\n\n');
};
```

### Core Identity Prompt

```
You are a skilled software engineer working on coding tasks.
You approach problems methodically, breaking them into manageable steps.

## Key Behaviors
1. ALWAYS update your todo list before and after each task
2. Use the filesystem for context offloading - write notes, plans, and intermediate results
3. For complex subtasks, delegate to spawn_subtask to keep your context clean
4. Explain your reasoning before taking actions
```

### Tool-Specific Guidance (injected by middleware)

```
## Todo List (TodoMiddleware)
- Update todos at the START of each task (mark in_progress)
- Update todos IMMEDIATELY when complete
- Break complex tasks into smaller items
- Never have more than one task in_progress

## File Operations (FilesystemMiddleware)
- Always check if files exist before writing
- Use edit_file for modifications, write_file for new files
- Prefer small, focused file operations

## Sub-task Delegation (SubAgentMiddleware)
- Use spawn_subtask for isolated, well-defined work
- Provide clear, specific prompts
- Subtasks cannot see your conversation history
- Use for: research, boilerplate generation, testing
```

---

## User Experience

### Primary Workflow (Updated)

1. User: "Build a REST API for user management"
2. Agent: Creates todo list (5 tasks) via write_todos
3. UI: Shows live todo list with statuses
4. Agent: Marks task 1 "in_progress", executes
5. UI shows: "Task 1/5: Setting up Express server..."
6. Agent: Spawns subtask for boilerplate generation
7. UI shows: "[Subtask] Generating route templates..."
8. Agent: Updates todos, continues
9. Context meter: 28% (green)
10. User can fork or revert at any checkpoint

### UI Layout (Updated)

```
+-----------------------------------------------------+
|  Agent        [Model v]  [Context: ### 32%]         |
+-----------------------------------------------------+
|  Chat Panel            |  Todo List (Live)          |
|  - User message        |  1. [x] Setup Express      |
|  - Agent response      |  2. [>] Creating routes... |
|  - [ Tool status ]     |  3. [ ] Add middleware     |
|  - [Subtask] ...       |  4. [ ] Write tests        |
|  [Fork] [Revert]       |  5. [ ] Documentation      |
+-----------------------------------------------------+
|  Type message...                           [Send >] |
+-----------------------------------------------------+
```

### SSE Events (Updated)

```typescript
event: todo_update
  data: { todos: Todo[] }

event: subtask_start
  data: { prompt: string, id: string }

event: subtask_complete
  data: { id: string, summary: string, success: boolean }

event: tool_start
  data: { name: string, summary: string }

event: tool_complete
  data: { name: string, success: boolean }

event: text
  data: { content: string }

event: context_update
  data: { usage: number, percentage: number }
```

---

## API Specification

### REST Endpoints

```typescript
POST /api/chat
  body: { message: string, model?: string }
  -> Streams via SSE

POST /api/approve
  body: { sessionId: string }
  -> Begins execution with current todos

POST /api/revert
  body: { sessionId: string, checkpointId: string }
  -> Restores state including todos

POST /api/fork
  body: { sessionId: string, checkpointId: string }
  -> Creates new session with copied todos

GET /api/todos/:sessionId
  -> Returns current todo list
```

---

## Project Structure (Updated)

```
coding-agent/
├── backend/
│   ├── src/
│   │   ├── middleware/           # NEW: Middleware system
│   │   │   ├── MiddlewareManager.ts
│   │   │   ├── TodoMiddleware.ts
│   │   │   ├── FilesystemMiddleware.ts
│   │   │   └── SubAgentMiddleware.ts
│   │   ├── agent/
│   │   │   ├── Orchestrator.ts
│   │   │   ├── ContextManager.ts
│   │   │   └── CheckpointManager.ts
│   │   ├── tools/
│   │   │   ├── ToolRegistry.ts
│   │   │   ├── FileTools.ts
│   │   │   ├── TodoTools.ts         # NEW
│   │   │   └── SubAgentTools.ts     # NEW
│   │   ├── prompts/               # NEW: Prompt templates
│   │   │   ├── core.ts
│   │   │   └── toolGuidance.ts
│   │   ├── routes/
│   │   └── index.ts
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── TodoList.tsx         # Enhanced
│   │   │   ├── ToolStatus.tsx
│   │   │   ├── SubTaskIndicator.tsx # NEW
│   │   │   └── ContextMeter.tsx
│   │   └── App.tsx
│   └── package.json
└── README.md
```

---

## Success Criteria

### Minimum Viable Demo (5 min)

Scenario: "Create a simple TODO list API"

Must demonstrate:
- [ ] Todo list creation (agent uses write_todos)
- [ ] Live todo updates in UI
- [ ] At least one subtask delegation
- [ ] Real-time tool streaming
- [ ] Files actually created
- [ ] Context under 40%
- [ ] Can revert to earlier point
- [ ] Professional UI

### Evaluation Focus (Anticipated)

- **Architecture (30%)** - Middleware design, separation of concerns
- **Code Quality (25%)** - TypeScript, clean interfaces, comments
- **Implementation (25%)** - Four principles implemented, streaming works
- **Documentation (15%)** - README, prompting strategy documented
- **UX (5%)** - Intuitive, clear feedback, live todo updates

---

## Feature Priority Matrix

### MVP (6 Hours) - Research Principles

| Feature | Principle | Time | Priority |
|---------|-----------|------|----------|
| TodoMiddleware | Planning | 45m | P0 |
| FilesystemMiddleware | Filesystem | 1.5h | P0 |
| SubAgentMiddleware | Delegation | 1h | P0 |
| System prompts | Prompting | 30m | P0 |
| MiddlewareManager | Architecture | 30m | P0 |
| SSE streaming | Core | 45m | P0 |
| React UI | Core | 1h | P0 |
| Checkpoints | Core | 45m | P1 |

### Stretch Goals

| Feature | Benefit | Time |
|---------|---------|------|
| SummarizationMiddleware | Auto-compress at 85% | 45m |
| PatchToolCallsMiddleware | Repair interrupted calls | 30m |
| Parallel subtasks | Faster execution | 1h |
| Persistent backend | Cross-session storage | 30m |

---

## Out of Scope (Document, Do Not Build)

Skip these for the 6-hour assessment:

- Sub-agent **pool** architecture (single subtask is sufficient)
- Parallel tool execution with dependency graphs
- Semantic code search / embeddings
- LSP integration
- Git operations (use file snapshots)
- Vector database
- Learning from past executions
- Advanced sandboxing / containers
- Multiple concurrent subtasks

Document these in README as future enhancements based on the four principles.

---

## Dependencies (Updated)

```json
{
  "backend": {
    "@anthropic-ai/sdk": "^0.9.0",
    "@anthropic-ai/tokenizer": "^0.1.0",
    "express": "^4.18.0",
    "zod": "^3.22.0",
    "execa": "^8.0.0",
    "uuid": "^9.0.0"
  },
  "frontend": {
    "react": "^18.2.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.4.0"
  }
}
```

---

## Time Management (Updated)

### Strict 6-Hour Breakdown

| Hour | Focus | Deliverables |
|------|-------|--------------|
| 1-2 | Backend Core | MiddlewareManager, TodoMiddleware, ToolRegistry, SSE |
| 2-3 | Filesystem + Context | FilesystemMiddleware, ContextManager, Checkpoints |
| 3-4 | SubAgent + Frontend | SubAgentMiddleware, React UI, TodoList component |
| 4-5 | Integration | End-to-end flow, error handling, testing |
| 5-6 | Documentation | README, prompts doc, demo video |

### If Running Behind

Priority order:
- **P0**: Streaming, TodoMiddleware, FilesystemMiddleware, basic UI
- **P1**: SubAgentMiddleware, checkpoints, fork/revert
- **P2**: Model selector, context warnings
- **P3**: Skip - document instead

---

## Key Principles

1. **Four Principles > Feature Count** - Implement planning, filesystem, delegation, prompting
2. **Middleware Architecture** - Composable, extensible design
3. **Streaming is CRITICAL** - Make it flawless
4. **Context Efficiency** - Use todos and subtasks to stay under 40%
5. **Simple is Better** - One subtask at a time is fine for MVP
6. **Document What You Skip** - Show understanding of full architecture
7. **Demo Matters** - 5-minute video showing todo updates and subtask delegation

---

## Final Checklist

Before submitting:

- [ ] All TypeScript compiles
- [ ] Middleware pipeline works
- [ ] Todo tools functional (write_todos, read_todos)
- [ ] Subtask spawning works
- [ ] Streaming works perfectly
- [ ] File operations work
- [ ] System prompts are comprehensive
- [ ] README documents four principles
- [ ] Setup instructions are clear
- [ ] AI usage documented
- [ ] Demo video recorded
- [ ] Git history is clean
- [ ] No hardcoded API keys
- [ ] No forbidden dependencies
