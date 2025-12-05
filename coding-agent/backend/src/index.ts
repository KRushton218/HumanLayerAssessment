import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { MiddlewareManager, TodoMiddleware, FilesystemMiddleware, SubAgentMiddleware } from './middleware/index.js';
import { LLMClient, ContextManager, CheckpointManager, Orchestrator } from './agent/index.js';
import { ApprovalManager } from './approval/index.js';

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
const approvalManager = new ApprovalManager();
const orchestrator = new Orchestrator(
  middlewareManager,
  llmClient,
  contextManager,
  checkpointManager,
  approvalManager
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
      workingDirectory: filesystemMiddleware.getTargetDirectory(),
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

// Get current target directory
app.get('/api/target', (_req: Request, res: Response) => {
  res.json({
    targetDirectory: filesystemMiddleware.getTargetDirectory(),
    allowedPaths: filesystemMiddleware.getAllowedPaths()
  });
});

// Set target directory
app.post('/api/target', async (req: Request, res: Response) => {
  const { targetDirectory } = req.body;

  if (!targetDirectory) {
    res.status(400).json({ error: 'targetDirectory required' });
    return;
  }

  // Validate the directory exists and is accessible
  const fs = await import('fs/promises');
  const path = await import('path');

  try {
    const resolved = path.resolve(targetDirectory);
    const stat = await fs.stat(resolved);

    if (!stat.isDirectory()) {
      res.status(400).json({ error: 'Path is not a directory' });
      return;
    }

    filesystemMiddleware.setTargetDirectory(resolved);
    res.json({
      status: 'updated',
      targetDirectory: resolved,
      allowedPaths: filesystemMiddleware.getAllowedPaths()
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: `Invalid directory: ${error}` });
  }
});

// Validate a target directory path
app.post('/api/target/validate', async (req: Request, res: Response) => {
  const { targetDirectory } = req.body;

  if (!targetDirectory) {
    res.status(400).json({ error: 'targetDirectory required' });
    return;
  }

  const fs = await import('fs/promises');
  const path = await import('path');

  try {
    const resolved = path.resolve(targetDirectory);
    const stat = await fs.stat(resolved);

    if (!stat.isDirectory()) {
      res.json({ valid: false, error: 'Path is not a directory' });
      return;
    }

    // Try to list directory to check read access
    await fs.readdir(resolved);

    res.json({
      valid: true,
      resolvedPath: resolved
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    res.json({ valid: false, error });
  }
});

// Handle approval response from frontend
app.post('/api/approval', (req: Request, res: Response) => {
  const { requestId, decision, pattern } = req.body;

  if (!requestId || !decision) {
    res.status(400).json({ error: 'requestId and decision required' });
    return;
  }

  const validDecisions = ['allow_once', 'allow_pattern', 'allow_tool', 'deny'];
  if (!validDecisions.includes(decision)) {
    res.status(400).json({ error: 'Invalid decision. Must be: allow_once, allow_pattern, allow_tool, or deny' });
    return;
  }

  const success = approvalManager.handleResponse({ requestId, decision, pattern });
  if (success) {
    res.json({ status: 'processed' });
  } else {
    res.status(404).json({ error: 'Approval request not found or expired' });
  }
});

// Autocomplete directories for path input (terminal-style tab completion)
app.post('/api/target/complete', async (req: Request, res: Response) => {
  const { partial } = req.body;

  if (partial === undefined) {
    res.status(400).json({ error: 'partial path required' });
    return;
  }

  const fs = await import('fs/promises');
  const pathModule = await import('path');
  const os = await import('os');

  try {
    // Handle ~ for home directory
    let expandedPath = partial;
    if (partial.startsWith('~')) {
      expandedPath = partial.replace(/^~/, os.homedir());
    }

    // Resolve to absolute path
    const resolved = pathModule.resolve(expandedPath);

    // Determine parent directory and prefix to match
    let parentDir: string;
    let prefix: string;

    // Check if the path exists and is a directory
    try {
      const stat = await fs.stat(resolved);
      if (stat.isDirectory()) {
        // Path is an existing directory - list its contents
        parentDir = resolved;
        prefix = '';
      } else {
        // Path is a file - list parent directory
        parentDir = pathModule.dirname(resolved);
        prefix = pathModule.basename(resolved);
      }
    } catch {
      // Path doesn't exist - find the parent directory that does exist
      parentDir = pathModule.dirname(resolved);
      prefix = pathModule.basename(resolved);
    }

    // List directory contents
    const entries = await fs.readdir(parentDir, { withFileTypes: true });

    // Filter to directories only, matching the prefix
    const suggestions = entries
      .filter(entry => entry.isDirectory())
      .filter(entry => !entry.name.startsWith('.')) // Hide hidden dirs by default
      .filter(entry => entry.name.toLowerCase().startsWith(prefix.toLowerCase()))
      .map(entry => {
        const fullPath = pathModule.join(parentDir, entry.name);
        // If input started with ~, show it with ~
        if (partial.startsWith('~')) {
          return fullPath.replace(os.homedir(), '~');
        }
        return fullPath;
      })
      .slice(0, 20); // Limit to 20 suggestions

    res.json({
      suggestions,
      parentDir: partial.startsWith('~') ? parentDir.replace(os.homedir(), '~') : parentDir
    });
  } catch (err) {
    // If we can't read the directory, return empty suggestions
    res.json({ suggestions: [], parentDir: null });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
