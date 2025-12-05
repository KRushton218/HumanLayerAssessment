import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Store active SSE connections
const connections = new Map<string, Response>();

// SSE endpoint
app.get('/api/events/:sessionId', (req: Request, res: Response) => {
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
export function emitEvent(sessionId: string, event: string, data: unknown): void {
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

// Chat endpoint (placeholder - will be implemented in Phase 4)
app.post('/api/chat', async (req: Request, res: Response) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    res.status(400).json({ error: 'sessionId and message required' });
    return;
  }

  // Placeholder response
  res.json({ status: 'received', sessionId });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
