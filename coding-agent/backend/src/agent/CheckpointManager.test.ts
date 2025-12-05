import { describe, it, expect, beforeEach } from 'vitest';
import { CheckpointManager } from './CheckpointManager.js';
import { AgentState } from '../middleware/types.js';

describe('CheckpointManager', () => {
  let manager: CheckpointManager;

  const createMockState = (sessionId: string, overrides: Partial<AgentState> = {}): AgentState => ({
    sessionId,
    messages: [{ role: 'user', content: 'Hello' }],
    todos: [{ id: '1', content: 'Task 1', status: 'pending' }],
    files: new Map([['file1.txt', 'content']]),
    checkpoints: new Map(),
    contextUsage: { tokens: 100, percentage: 5 },
    ...overrides,
  });

  beforeEach(() => {
    manager = new CheckpointManager();
  });

  describe('createCheckpoint', () => {
    it('should create checkpoint and return ID', () => {
      const state = createMockState('session-1');

      const checkpointId = manager.createCheckpoint(state);

      expect(checkpointId).toBeDefined();
      expect(typeof checkpointId).toBe('string');
      expect(checkpointId.length).toBeGreaterThan(0);
    });

    it('should store checkpoint state', () => {
      const state = createMockState('session-1');

      const checkpointId = manager.createCheckpoint(state);
      const checkpoint = manager.getCheckpoint('session-1', checkpointId);

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.id).toBe(checkpointId);
      expect(checkpoint?.state.sessionId).toBe('session-1');
    });

    it('should deep clone messages', () => {
      const state = createMockState('session-1');
      const originalMessages = [...state.messages];

      const checkpointId = manager.createCheckpoint(state);

      // Modify original state
      state.messages.push({ role: 'assistant', content: 'Response' });

      const checkpoint = manager.getCheckpoint('session-1', checkpointId);
      expect(checkpoint?.state.messages).toHaveLength(originalMessages.length);
    });

    it('should deep clone todos', () => {
      const state = createMockState('session-1');

      const checkpointId = manager.createCheckpoint(state);

      // Modify original state
      state.todos[0].status = 'completed';

      const checkpoint = manager.getCheckpoint('session-1', checkpointId);
      expect(checkpoint?.state.todos[0].status).toBe('pending');
    });

    it('should set timestamp', () => {
      const state = createMockState('session-1');
      const beforeTime = Date.now();

      const checkpointId = manager.createCheckpoint(state);

      const checkpoint = manager.getCheckpoint('session-1', checkpointId);
      expect(checkpoint?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(checkpoint?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should not nest checkpoints in checkpoint state', () => {
      const state = createMockState('session-1');
      state.checkpoints.set('old-checkpoint', {
        id: 'old-checkpoint',
        timestamp: Date.now(),
        state: state,
      });

      const checkpointId = manager.createCheckpoint(state);

      const checkpoint = manager.getCheckpoint('session-1', checkpointId);
      expect(checkpoint?.state.checkpoints.size).toBe(0);
    });
  });

  describe('getCheckpoint', () => {
    it('should return undefined for non-existent session', () => {
      const checkpoint = manager.getCheckpoint('nonexistent', 'checkpoint-id');

      expect(checkpoint).toBeUndefined();
    });

    it('should return undefined for non-existent checkpoint', () => {
      const state = createMockState('session-1');
      manager.createCheckpoint(state);

      const checkpoint = manager.getCheckpoint('session-1', 'nonexistent');

      expect(checkpoint).toBeUndefined();
    });

    it('should return existing checkpoint', () => {
      const state = createMockState('session-1');
      const checkpointId = manager.createCheckpoint(state);

      const checkpoint = manager.getCheckpoint('session-1', checkpointId);

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.id).toBe(checkpointId);
    });
  });

  describe('listCheckpoints', () => {
    it('should return empty array for non-existent session', () => {
      const checkpoints = manager.listCheckpoints('nonexistent');

      expect(checkpoints).toEqual([]);
    });

    it('should return all checkpoints for session', () => {
      const state = createMockState('session-1');
      const id1 = manager.createCheckpoint(state);
      const id2 = manager.createCheckpoint(state);
      const id3 = manager.createCheckpoint(state);

      const checkpoints = manager.listCheckpoints('session-1');

      expect(checkpoints).toHaveLength(3);
      const ids = checkpoints.map(c => c.id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
      expect(ids).toContain(id3);
    });

    it('should sort checkpoints by timestamp (newest first)', async () => {
      const state = createMockState('session-1');

      manager.createCheckpoint(state);
      await new Promise(resolve => setTimeout(resolve, 10));
      manager.createCheckpoint(state);
      await new Promise(resolve => setTimeout(resolve, 10));
      const newestId = manager.createCheckpoint(state);

      const checkpoints = manager.listCheckpoints('session-1');

      expect(checkpoints[0].id).toBe(newestId);
      expect(checkpoints[0].timestamp).toBeGreaterThanOrEqual(checkpoints[1].timestamp);
      expect(checkpoints[1].timestamp).toBeGreaterThanOrEqual(checkpoints[2].timestamp);
    });

    it('should isolate checkpoints between sessions', () => {
      const state1 = createMockState('session-1');
      const state2 = createMockState('session-2');

      manager.createCheckpoint(state1);
      manager.createCheckpoint(state1);
      manager.createCheckpoint(state2);

      expect(manager.listCheckpoints('session-1')).toHaveLength(2);
      expect(manager.listCheckpoints('session-2')).toHaveLength(1);
    });
  });

  describe('revertToCheckpoint', () => {
    it('should return null for non-existent checkpoint', () => {
      const result = manager.revertToCheckpoint('session-1', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return cloned state from checkpoint', () => {
      const state = createMockState('session-1');
      const checkpointId = manager.createCheckpoint(state);

      const reverted = manager.revertToCheckpoint('session-1', checkpointId);

      expect(reverted).toBeDefined();
      expect(reverted?.sessionId).toBe('session-1');
      expect(reverted?.messages).toHaveLength(1);
      expect(reverted?.todos).toHaveLength(1);
    });

    it('should return deep clone (modifications do not affect checkpoint)', () => {
      const state = createMockState('session-1');
      const checkpointId = manager.createCheckpoint(state);

      const reverted1 = manager.revertToCheckpoint('session-1', checkpointId);
      reverted1!.messages.push({ role: 'assistant', content: 'Modified' });
      reverted1!.todos[0].status = 'completed';

      const reverted2 = manager.revertToCheckpoint('session-1', checkpointId);
      expect(reverted2?.messages).toHaveLength(1);
      expect(reverted2?.todos[0].status).toBe('pending');
    });

    it('should include session checkpoints in reverted state', () => {
      const state = createMockState('session-1');
      manager.createCheckpoint(state);
      const checkpointId = manager.createCheckpoint(state);

      const reverted = manager.revertToCheckpoint('session-1', checkpointId);

      expect(reverted?.checkpoints.size).toBe(2);
    });
  });

  describe('forkFromCheckpoint', () => {
    it('should return null for non-existent checkpoint', () => {
      const result = manager.forkFromCheckpoint('session-1', 'nonexistent', 'new-session');

      expect(result).toBeNull();
    });

    it('should create new state with new session ID', () => {
      const state = createMockState('session-1');
      const checkpointId = manager.createCheckpoint(state);

      const forked = manager.forkFromCheckpoint('session-1', checkpointId, 'forked-session');

      expect(forked).toBeDefined();
      expect(forked?.sessionId).toBe('forked-session');
    });

    it('should clone state data', () => {
      const state = createMockState('session-1', {
        messages: [
          { role: 'user', content: 'Question' },
          { role: 'assistant', content: 'Answer' },
        ],
        todos: [
          { id: '1', content: 'Todo 1', status: 'completed' },
          { id: '2', content: 'Todo 2', status: 'pending' },
        ],
      });
      const checkpointId = manager.createCheckpoint(state);

      const forked = manager.forkFromCheckpoint('session-1', checkpointId, 'forked-session');

      expect(forked?.messages).toHaveLength(2);
      expect(forked?.todos).toHaveLength(2);
      expect(forked?.contextUsage.tokens).toBe(100);
    });

    it('should be independent from original checkpoint', () => {
      const state = createMockState('session-1');
      const checkpointId = manager.createCheckpoint(state);

      const forked = manager.forkFromCheckpoint('session-1', checkpointId, 'forked-session');
      forked!.messages.push({ role: 'user', content: 'New message' });

      const original = manager.revertToCheckpoint('session-1', checkpointId);
      expect(original?.messages).toHaveLength(1);
    });
  });

  describe('multiple sessions workflow', () => {
    it('should handle multiple sessions independently', () => {
      const state1 = createMockState('session-1', {
        messages: [{ role: 'user', content: 'Session 1 message' }],
      });
      const state2 = createMockState('session-2', {
        messages: [{ role: 'user', content: 'Session 2 message' }],
      });

      const checkpoint1 = manager.createCheckpoint(state1);
      const checkpoint2 = manager.createCheckpoint(state2);

      const reverted1 = manager.revertToCheckpoint('session-1', checkpoint1);
      const reverted2 = manager.revertToCheckpoint('session-2', checkpoint2);

      expect(reverted1?.messages[0].content).toBe('Session 1 message');
      expect(reverted2?.messages[0].content).toBe('Session 2 message');
    });
  });
});
