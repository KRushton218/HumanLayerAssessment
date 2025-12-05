# HumanLayer TypeScript Coding Agent

A full-stack AI coding agent with a modern web UI, implementing research-backed principles for handling long-horizon coding tasks effectively.

## Demo Video

- **Part 1**: https://www.loom.com/share/9dcace1983934de397f58e56710edd96
- **Part 2**: https://www.loom.com/share/df1e6d0403ce458090b2626803f5100e

---

## Project Overview

### Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS |
| **Backend** | Node.js + Express + TypeScript |
| **LLM** | Anthropic Claude API (Sonnet 4, Opus 4.5) |
| **Streaming** | Server-Sent Events (SSE) for real-time updates |
| **Validation** | Zod schemas for tool inputs |

### Architecture

The system uses a **middleware-based architecture** for extensibility and separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend                               │
│  Chat UI │ Todo List │ Context Meter │ Checkpoint Controls       │
└─────────────────────────────SSE─────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                     Express Backend                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Orchestrator                            │    │
│  │   Agent loop • Tool execution • Checkpoint management    │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               Middleware Pipeline                        │    │
│  │  TodoMiddleware → FilesystemMiddleware → SubAgentMW     │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Context Manager │ Checkpoint Manager │ Approval Manager │   │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Anthropic Claude API
```

### Design Decisions

#### Four Research-Backed Principles

This agent implements the four principles identified in deep agent research for handling long-horizon tasks:

1. **Planning Tool (TodoMiddleware)**
   - `write_todos` / `read_todos` for persistent task tracking
   - Hierarchical todo support with parent-child relationships
   - Status tracking: pending → in_progress → completed
   - Forces the agent to think step-by-step and maintain state

2. **Filesystem Access (FilesystemMiddleware)**
   - `read_file`, `write_file`, `edit_file`, `list_directory`
   - `execute_shell` with background process support
   - Path validation prevents directory traversal attacks
   - Context offloading - write intermediate results to files

3. **Sub-agent Delegation (SubAgentMiddleware)**
   - `spawn_subtask` creates isolated LLM conversations
   - Fresh context window prevents pollution
   - Configurable tool access per subtask
   - Returns structured summary to parent agent

4. **Detailed Prompting (Middleware System)**
   - Each middleware contributes its own system prompt
   - Prompts composed at runtime into cohesive guidance
   - Tool-specific behavioral instructions

#### Key Architectural Choices

- **Middleware Pattern**: New capabilities (tools, prompts, hooks) added via middleware without touching core orchestration
- **SSE over WebSockets**: Simpler protocol, native browser support, perfect for unidirectional streaming
- **Zod Schemas**: Runtime type validation for all tool inputs, auto-converted to JSON Schema for Claude
- **In-Memory State**: Checkpoints, todos, and files stored in memory (suitable for single-session demo)
- **Real Token Counting**: Uses actual API response token counts rather than heuristic estimation

### Features

#### Core Features
- ✅ Real-time streaming chat with Claude
- ✅ Todo list with live updates and hierarchy support
- ✅ File operations (read, write, edit, list)
- ✅ Shell command execution with background process management
- ✅ Sub-agent task delegation
- ✅ Checkpoint system with revert/fork capabilities
- ✅ Human-in-the-loop approval for tool execution
- ✅ Context usage tracking with accurate token counts

#### UI Features
- ✅ Dark/light theme toggle
- ✅ Model selector (Claude Sonnet 4, Opus 4.5)
- ✅ Target directory selector with tab completion
- ✅ File preview modal for viewing code
- ✅ Progress indicators for long-running operations
- ✅ Collapsible tool output panels
- ✅ Process manager for background tasks

---

## Getting Started

### Prerequisites

- **Node.js 18+** (LTS recommended)
- **npm** (comes with Node.js)
- **Anthropic API Key** ([Get one here](https://console.anthropic.com/))

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd HumanLayer
   ```

2. **Install backend dependencies**
   ```bash
   cd coding-agent/backend
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Start the backend** (in one terminal)
   ```bash
   cd coding-agent/backend
   npm run dev
   ```
   The backend will start at http://localhost:3001

5. **Start the frontend** (in another terminal)
   ```bash
   cd coding-agent/frontend
   npm run dev
   ```
   The frontend will start at http://localhost:5173

6. **Open the app** and enter your Anthropic API key when prompted

### Configuration

- **API Key**: Enter via the UI on first launch, or set `ANTHROPIC_API_KEY` environment variable
- **Target Directory**: Select the directory the agent should work in via the UI dropdown
- **Model**: Choose between Claude Sonnet 4 (faster) or Opus 4.5 (more capable)

### Running Tests

```bash
# Backend tests
cd coding-agent/backend
npm test

# Frontend tests
cd coding-agent/frontend
npm test
```

---

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/session` | Create new session |
| `POST` | `/api/chat` | Send message to agent |
| `GET` | `/api/events/:sessionId` | SSE event stream |
| `GET` | `/api/todos/:sessionId` | Get todo list |
| `GET` | `/api/checkpoints/:sessionId` | List checkpoints |
| `POST` | `/api/revert` | Revert to checkpoint |
| `POST` | `/api/fork` | Fork from checkpoint |
| `POST` | `/api/approval` | Handle approval decision |
| `GET` | `/api/file?path=...` | Preview file content |
| `POST` | `/api/target` | Set working directory |
| `GET` | `/api/processes/:sessionId` | List background processes |

### SSE Events

| Event | Description |
|-------|-------------|
| `text` | Streaming text content |
| `tool_start` | Tool execution beginning |
| `tool_complete` | Tool execution finished |
| `todo_update` | Todo list changed |
| `subtask_start` | Sub-agent spawned |
| `subtask_complete` | Sub-agent finished |
| `context_update` | Token usage updated |
| `checkpoint_created` | New checkpoint available |
| `approval_required` | Human approval needed |

---

## Coding Agent Usage & Methodology

### Tools Used

This project was built with significant assistance from AI coding agents:

1. **Cursor with Claude** - Primary development environment
2. **Claude Opus 4.5** - Architecture planning, complex implementations
3. **Claude Sonnet 4** - Rapid iteration, test writing, documentation

### Development Methodology

#### Phase 1: Architecture Planning
Used Claude to analyze the PRD and design the middleware architecture. Key outputs:
- Middleware interface specification
- Component responsibility mapping
- SSE event schema design

#### Phase 2: Scaffolding
Agent-assisted generation of:
- Project structure and configuration files
- TypeScript interfaces and type definitions
- Base class implementations

#### Phase 3: Iterative Implementation
For each component (TodoMiddleware, FilesystemMiddleware, etc.):
1. Describe the component requirements to the agent
2. Review generated implementation
3. Request refinements or additions
4. Write tests (often agent-assisted)
5. Fix edge cases

#### Phase 4: Integration & Polish
- End-to-end testing with agent assistance
- UI/UX refinements
- Documentation generation

### Effective Prompting Patterns

What worked well:
- **Specific context**: Providing relevant code snippets when asking for changes
- **Incremental requests**: Building features step-by-step rather than all at once
- **Test-driven prompts**: Asking for tests alongside implementations
- **Architecture-first**: Getting the structure right before filling in details

### Time Breakdown (Approximate)

| Phase | Time | AI Assistance Level |
|-------|------|---------------------|
| Planning & Design | 1h | High (architecture discussions) |
| Backend Core | 2h | High (middleware, orchestrator) |
| Frontend UI | 2h | Medium (component generation) |
| Integration | 1h | Medium (debugging, edge cases) |
| Documentation | 30m | High (README, comments) |

---

## Project Structure

```
HumanLayer/
├── coding-agent/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── agent/           # LLM client, orchestrator, context management
│   │   │   │   ├── Orchestrator.ts
│   │   │   │   ├── LLMClient.ts
│   │   │   │   ├── ContextManager.ts
│   │   │   │   ├── CheckpointManager.ts
│   │   │   │   └── CheckpointNameGenerator.ts
│   │   │   ├── middleware/      # Extensible middleware system
│   │   │   │   ├── MiddlewareManager.ts
│   │   │   │   ├── TodoMiddleware.ts
│   │   │   │   ├── FilesystemMiddleware.ts
│   │   │   │   └── SubAgentMiddleware.ts
│   │   │   ├── approval/        # Human-in-the-loop system
│   │   │   ├── tools/           # Tool registry with Zod schemas
│   │   │   └── index.ts         # Express server with SSE
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── components/      # React components
│       │   ├── hooks/           # Custom hooks (useSSE)
│       │   ├── contexts/        # Theme context
│       │   ├── api.ts           # API client
│       │   └── App.tsx          # Main application
│       └── package.json
├── coding_tools/                # Agent/command templates
├── docs/                        # Project documentation
└── README.md
```

---

## Future Enhancements

Based on deep agent research, these would be valuable additions:

- **Summarization Middleware**: Auto-compress context at 85% usage
- **Parallel Subtasks**: Execute independent tasks concurrently
- **Persistent Storage**: Database-backed checkpoints and todos
- **Semantic Code Search**: Embeddings for intelligent code navigation
- **Git Integration**: Native version control operations
- **Tool Patching**: Repair interrupted tool calls automatically

---

## License

MIT

---

## Acknowledgments

- [Anthropic](https://anthropic.com) for the Claude API
- [HumanLayer](https://humanlayer.dev) for the assessment framework
- Deep agent research papers that informed the four-principle architecture
