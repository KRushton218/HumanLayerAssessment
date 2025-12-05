import { v4 as uuidv4 } from 'uuid';
import { AgentState, Checkpoint } from '../middleware/types.js';

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

  updateCheckpointName(sessionId: string, checkpointId: string, name: string, actionSummary?: string): void {
    const checkpoint = this.getCheckpoint(sessionId, checkpointId);
    if (checkpoint) {
      checkpoint.name = name;
      if (actionSummary) {
        checkpoint.actionSummary = actionSummary;
      }
    }
  }

  listCheckpoints(sessionId: string): Array<{ id: string; timestamp: number; name?: string; actionSummary?: string }> {
    const sessionCheckpoints = this.checkpoints.get(sessionId);
    if (!sessionCheckpoints) return [];

    return Array.from(sessionCheckpoints.values())
      .map(c => ({ id: c.id, timestamp: c.timestamp, name: c.name, actionSummary: c.actionSummary }))
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
