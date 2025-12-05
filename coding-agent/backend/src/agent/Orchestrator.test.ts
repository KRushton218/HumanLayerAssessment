import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { Orchestrator, OrchestratorConfig } from './Orchestrator.js';
import { MiddlewareManager } from '../middleware/MiddlewareManager.js';
import { LLMClient, StreamEvent } from './LLMClient.js';
import { ContextManager } from './ContextManager.js';
import { CheckpointManager } from './CheckpointManager.js';
import { ApprovalManager } from '../approval/index.js';
import { Middleware } from '../middleware/types.js';
import { ToolResult } from '../tools/ToolRegistry.js';

// Mock LLMClient
vi.mock('./LLMClient.js', () => {
  return {
    LLMClient: vi.fn().mockImplementation(() => ({
      streamMessage: vi.fn(),
      setModel: vi.fn(),
      getModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
    })),
  };
});

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let middlewareManager: MiddlewareManager;
  let mockLLMClient: { streamMessage: ReturnType<typeof vi.fn>; setModel: ReturnType<typeof vi.fn> };
  let contextManager: ContextManager;
  let checkpointManager: CheckpointManager;
  let approvalManager: ApprovalManager;
  let mockConfig: OrchestratorConfig;

  // Helper to create async generator from events
  async function* createMockStream(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
    for (const event of events) {
      yield event;
    }
  }

  beforeEach(() => {
    middlewareManager = new MiddlewareManager();
    mockLLMClient = {
      streamMessage: vi.fn(),
      setModel: vi.fn(),
    };
    contextManager = new ContextManager();
    checkpointManager = new CheckpointManager();
    approvalManager = new ApprovalManager();

    orchestrator = new Orchestrator(
      middlewareManager,
      mockLLMClient as unknown as LLMClient,
      contextManager,
      checkpointManager,
      approvalManager
    );

    mockConfig = {
      workingDirectory: '/test',
      emit: vi.fn(),
    };
  });

  describe('getOrCreateState', () => {
    it('should create new state for new session', () => {
      const state = orchestrator.getOrCreateState('new-session');

      expect(state.sessionId).toBe('new-session');
      expect(state.messages).toEqual([]);
      expect(state.todos).toEqual([]);
      expect(state.contextUsage.tokens).toBe(0);
    });

    it('should return existing state for existing session', () => {
      const state1 = orchestrator.getOrCreateState('session-1');
      state1.messages.push({ role: 'user', content: 'Hello' });

      const state2 = orchestrator.getOrCreateState('session-1');

      expect(state2.messages).toHaveLength(1);
      expect(state2).toBe(state1);
    });
  });

  describe('processMessage', () => {
    it('should add user message to state', async () => {
      mockLLMClient.streamMessage.mockReturnValue(
        createMockStream([
          { type: 'text', text: 'Response' },
          { type: 'message_stop' },
        ])
      );

      await orchestrator.processMessage('session-1', 'Hello', mockConfig);

      const state = orchestrator.getOrCreateState('session-1');
      expect(state.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should create checkpoint before processing', async () => {
      mockLLMClient.streamMessage.mockReturnValue(
        createMockStream([
          { type: 'text', text: 'Response' },
          { type: 'message_stop' },
        ])
      );

      await orchestrator.processMessage('session-1', 'Hello', mockConfig);

      expect(mockConfig.emit).toHaveBeenCalledWith('checkpoint_created', expect.any(Object));
    });

    it('should emit text events during streaming', async () => {
      mockLLMClient.streamMessage.mockReturnValue(
        createMockStream([
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' World' },
          { type: 'message_stop' },
        ])
      );

      await orchestrator.processMessage('session-1', 'Hi', mockConfig);

      expect(mockConfig.emit).toHaveBeenCalledWith('text', { content: 'Hello' });
      expect(mockConfig.emit).toHaveBeenCalledWith('text', { content: ' World' });
    });

    it('should add assistant message to state', async () => {
      mockLLMClient.streamMessage.mockReturnValue(
        createMockStream([
          { type: 'text', text: 'Response text' },
          { type: 'message_stop' },
        ])
      );

      await orchestrator.processMessage('session-1', 'Hello', mockConfig);

      const state = orchestrator.getOrCreateState('session-1');
      expect(state.messages).toHaveLength(2);
      expect(state.messages[1]).toEqual({ role: 'assistant', content: 'Response text' });
    });

    it('should emit context_update after processing', async () => {
      mockLLMClient.streamMessage.mockReturnValue(
        createMockStream([
          { type: 'text', text: 'Response' },
          { type: 'usage_update', usage: { input_tokens: 100, output_tokens: 50 } },
          { type: 'message_stop' },
        ])
      );

      await orchestrator.processMessage('session-1', 'Hello', mockConfig);

      expect(mockConfig.emit).toHaveBeenCalledWith('context_update', expect.objectContaining({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        totalTokens: expect.any(Number),
        percentage: expect.any(Number),
      }));
    });

    it('should handle tool calls', async () => {
      // Register a test tool
      const testMiddleware: Middleware = {
        name: 'test',
        systemPrompt: '',
        tools: [{
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: z.object({ value: z.string() }),
          execute: async (): Promise<ToolResult> => {
            return { success: true, output: 'Tool executed!' };
          },
        }],
      };
      middlewareManager.register(testMiddleware);

      // First call: return tool use
      mockLLMClient.streamMessage
        .mockReturnValueOnce(
          createMockStream([
            { type: 'tool_use', id: 'tool-1', name: 'test_tool' },
            { type: 'tool_use', text: '{"value":"test"}' },
            { type: 'content_block_stop' },
            { type: 'message_stop' },
          ])
        )
        // Second call: return final text
        .mockReturnValueOnce(
          createMockStream([
            { type: 'text', text: 'Done!' },
            { type: 'message_stop' },
          ])
        );

      await orchestrator.processMessage('session-1', 'Use the tool', mockConfig);

      // Should have called LLM twice (once for tool call, once for final response)
      expect(mockLLMClient.streamMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle unknown tool gracefully', async () => {
      mockLLMClient.streamMessage
        .mockReturnValueOnce(
          createMockStream([
            { type: 'tool_use', id: 'tool-1', name: 'unknown_tool' },
            { type: 'tool_use', text: '{}' },
            { type: 'content_block_stop' },
            { type: 'message_stop' },
          ])
        )
        .mockReturnValueOnce(
          createMockStream([
            { type: 'text', text: 'Handled error' },
            { type: 'message_stop' },
          ])
        );

      await orchestrator.processMessage('session-1', 'Use unknown tool', mockConfig);

      const state = orchestrator.getOrCreateState('session-1');
      // Should have tool result with error message
      const toolResultMessage = state.messages.find(m =>
        Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some(c => c.type === 'tool_result')
      );
      expect(toolResultMessage).toBeDefined();
    });
  });

  describe('revertToCheckpoint', () => {
    it('should return false for non-existent checkpoint', () => {
      const result = orchestrator.revertToCheckpoint('session-1', 'nonexistent');

      expect(result).toBe(false);
    });

    it('should revert state to checkpoint', async () => {
      mockLLMClient.streamMessage.mockReturnValue(
        createMockStream([
          { type: 'text', text: 'First response' },
          { type: 'message_stop' },
        ])
      );

      await orchestrator.processMessage('session-1', 'First message', mockConfig);

      // Get checkpoint ID from emit call
      const checkpointCall = (mockConfig.emit as ReturnType<typeof vi.fn>).mock.calls.find(
        call => call[0] === 'checkpoint_created'
      );
      const checkpointId = checkpointCall?.[1].id;

      // Add more messages
      await orchestrator.processMessage('session-1', 'Second message', mockConfig);

      // Revert
      const result = orchestrator.revertToCheckpoint('session-1', checkpointId);

      expect(result).toBe(true);
      const state = orchestrator.getOrCreateState('session-1');
      // State should have only the first user message (checkpoint was before processing)
      expect(state.messages[0].content).toBe('First message');
    });
  });

  describe('forkFromCheckpoint', () => {
    it('should return false for non-existent checkpoint', () => {
      const result = orchestrator.forkFromCheckpoint('session-1', 'nonexistent', 'new-session');

      expect(result).toBe(false);
    });

    it('should create new session with forked state', async () => {
      mockLLMClient.streamMessage.mockReturnValue(
        createMockStream([
          { type: 'text', text: 'Response' },
          { type: 'message_stop' },
        ])
      );

      await orchestrator.processMessage('session-1', 'Message', mockConfig);

      const checkpointCall = (mockConfig.emit as ReturnType<typeof vi.fn>).mock.calls.find(
        call => call[0] === 'checkpoint_created'
      );
      const checkpointId = checkpointCall?.[1].id;

      const result = orchestrator.forkFromCheckpoint('session-1', checkpointId, 'forked-session');

      expect(result).toBe(true);
      const forkedState = orchestrator.getOrCreateState('forked-session');
      expect(forkedState.sessionId).toBe('forked-session');
      expect(forkedState.messages[0].content).toBe('Message');
    });
  });

  describe('getCheckpoints', () => {
    it('should return empty array for new session', () => {
      const checkpoints = orchestrator.getCheckpoints('new-session');

      expect(checkpoints).toEqual([]);
    });

    it('should return checkpoints for session', async () => {
      mockLLMClient.streamMessage.mockReturnValue(
        createMockStream([
          { type: 'text', text: 'Response' },
          { type: 'message_stop' },
        ])
      );

      await orchestrator.processMessage('session-1', 'Message 1', mockConfig);
      await orchestrator.processMessage('session-1', 'Message 2', mockConfig);

      const checkpoints = orchestrator.getCheckpoints('session-1');

      expect(checkpoints).toHaveLength(2);
    });
  });

  describe('setModel', () => {
    it('should delegate to LLMClient', () => {
      orchestrator.setModel('claude-opus-4-20250514');

      expect(mockLLMClient.setModel).toHaveBeenCalledWith('claude-opus-4-20250514');
    });
  });
});
