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

export interface TargetInfo {
  targetDirectory: string;
  allowedPaths: string[];
}

export async function getTarget(): Promise<TargetInfo> {
  const res = await fetch(`${API_BASE}/target`);
  return res.json();
}

export async function setTarget(targetDirectory: string): Promise<TargetInfo & { status: string }> {
  const res = await fetch(`${API_BASE}/target`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDirectory }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to set target directory');
  }
  return res.json();
}

export async function validateTarget(targetDirectory: string): Promise<{ valid: boolean; resolvedPath?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/target/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDirectory }),
  });
  return res.json();
}

export interface CompletionResult {
  suggestions: string[];
  parentDir: string | null;
}

export async function completeTarget(partial: string): Promise<CompletionResult> {
  const res = await fetch(`${API_BASE}/target/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partial }),
  });
  return res.json();
}
