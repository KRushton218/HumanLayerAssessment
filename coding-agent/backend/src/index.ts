import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { MiddlewareManager, TodoMiddleware, FilesystemMiddleware, SubAgentMiddleware } from './middleware/index.js';
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

const subAgentMiddleware = new SubAgentMiddleware(middlewareManager.getToolRegistry());
middlewareManager.register(subAgentMiddleware);

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
const connections = new Map<string, Response>();

// SSE endpoint
app.get('/api/events/:sessionId', (req: Request, res: Response) => {
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
function emitEvent(sessionId: string, event: string, data: unknown): void {
  const connection = connections.get(sessionId);
  if (connection) {
    connection.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Create new session
app.post('/api/session', (_req: Request, res: Response) => {
  const sessionId = uuidv4();
  res.json({ sessionId });
});

// Chat endpoint
app.post('/api/chat', async (req: Request, res: Response) => {
  const { sessionId, message, model } = req.body;

  if (!sessionId || !message) {
    res.status(400).json({ error: 'sessionId and message required' });
    return;
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
app.get('/api/todos/:sessionId', (req: Request, res: Response) => {
  const todos = todoMiddleware.getTodos(req.params.sessionId);
  res.json({ todos });
});

// Get checkpoints for session
app.get('/api/checkpoints/:sessionId', (req: Request, res: Response) => {
  const checkpoints = orchestrator.getCheckpoints(req.params.sessionId);
  res.json({ checkpoints });
});

// Revert to checkpoint
app.post('/api/revert', (req: Request, res: Response) => {
  const { sessionId, checkpointId } = req.body;

  if (!sessionId || !checkpointId) {
    res.status(400).json({ error: 'sessionId and checkpointId required' });
    return;
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
app.post('/api/fork', (req: Request, res: Response) => {
  const { sessionId, checkpointId } = req.body;

  if (!sessionId || !checkpointId) {
    res.status(400).json({ error: 'sessionId and checkpointId required' });
    return;
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
app.post('/api/model', (req: Request, res: Response) => {
  const { model } = req.body;
  if (!model) {
    res.status(400).json({ error: 'model required' });
    return;
  }
  orchestrator.setModel(model);
  res.json({ status: 'updated', model });
});

// Set API key
app.post('/api/apikey', (req: Request, res: Response) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    res.status(400).json({ error: 'apiKey required' });
    return;
  }
  orchestrator.setApiKey(apiKey);
  subAgentMiddleware.setApiKey(apiKey);
  res.json({ status: 'updated' });
});

// Check if API key is configured
app.get('/api/apikey/status', (_req: Request, res: Response) => {
  res.json({ hasApiKey: orchestrator.hasApiKey() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
