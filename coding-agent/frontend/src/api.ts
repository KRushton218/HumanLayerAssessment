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

export async function setApiKey(apiKey: string): Promise<void> {
  await fetch(`${API_BASE}/apikey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
}

export async function getApiKeyStatus(): Promise<{ hasApiKey: boolean }> {
  const res = await fetch(`${API_BASE}/apikey/status`);
  return res.json();
}
