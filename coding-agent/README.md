# Coding Agent

A TypeScript-based AI coding agent with a web UI, implementing the four principles for handling long-horizon tasks:

1. **Planning Tool** - TodoManager for task tracking
2. **Filesystem Access** - File tools with context offloading
3. **Sub-agent Delegation** - Task spawning with isolated context
4. **Detailed Prompting** - Structured system prompts per component

## Project Structure

```
coding-agent/
├── backend/          # Express + TypeScript backend
│   ├── src/
│   │   ├── agent/    # LLM client and orchestration
│   │   ├── tools/    # Tool registry and definitions
│   │   ├── middleware/  # Middleware components
│   │   └── index.ts  # Express server with SSE
│   └── package.json
└── frontend/         # React + Vite frontend (Phase 6)
```

## Setup

### Prerequisites

- Node.js 18+
- npm
- Anthropic API key

### Backend

```bash
cd backend
npm install
```

Set your Anthropic API key:
```bash
export ANTHROPIC_API_KEY=your-key-here
```

### Running

Development mode:
```bash
cd backend
npm run dev
```

The server will start at http://localhost:3001

### API Endpoints

- `GET /api/health` - Health check
- `POST /api/session` - Create new session
- `GET /api/events/:sessionId` - SSE event stream
- `POST /api/chat` - Send chat message

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build
npm run build
```
