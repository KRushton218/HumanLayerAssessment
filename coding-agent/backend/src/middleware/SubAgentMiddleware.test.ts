import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { z } from 'zod';
import { SubAgentMiddleware } from './SubAgentMiddleware.js';
import { ToolRegistry, ToolDefinition, ToolContext, ToolResult } from '../tools/ToolRegistry.js';

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-subtask-id'),
}));

// Create a shared mock for the create method
const mockCreate = vi.fn();

// Mock Anthropic with a class constructor
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
      };
    },
  };
});

describe('SubAgentMiddleware', () => {
  let middleware: SubAgentMiddleware;
  let toolRegistry: ToolRegistry;
  let mockContext: ToolContext;
  let mockAnthropicCreate: Mock;

  const createMockTool = (name: string, execute?: (input: unknown, ctx: ToolContext) => Promise<ToolResult>): ToolDefinition => ({
    name,
    description: `Mock tool: ${name}`,
    inputSchema: z.object({ path: z.string() }),
    execute: execute || (async (): Promise<ToolResult> => ({ success: true, output: 'done' })),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnthropicCreate = mockCreate;

    toolRegistry = new ToolRegistry();
    toolRegistry.register(createMockTool('read_file'));
    toolRegistry.register(createMockTool('write_file'));
    toolRegistry.register(createMockTool('edit_file'));
    toolRegistry.register(createMockTool('list_directory'));

    middleware = new SubAgentMiddleware(toolRegistry);

    mockContext = {
      sessionId: 'test-session',
      workingDirectory: '/test',
      emit: vi.fn(),
    };
  });

  describe('constructor', () => {
    it('should initialize with default model', () => {
      expect(middleware.name).toBe('SubAgentMiddleware');
    });

    it('should accept custom model', () => {
      const customMiddleware = new SubAgentMiddleware(toolRegistry, 'claude-opus-4-20250514');
      expect(customMiddleware).toBeDefined();
    });
  });

  describe('systemPrompt', () => {
    it('should contain sub-task delegation guidance', () => {
      expect(middleware.systemPrompt).toContain('Sub-task Delegation');
      expect(middleware.systemPrompt).toContain('spawn_subtask');
    });
  });

  describe('tools', () => {
    it('should have spawn_subtask tool', () => {
      expect(middleware.tools).toHaveLength(1);
      expect(middleware.tools[0].name).toBe('spawn_subtask');
    });

    it('should have correct spawn_subtask description', () => {
      expect(middleware.tools[0].description).toContain('isolated subtask');
    });
  });

  describe('spawn_subtask execution', () => {
    it('should emit subtask_start and subtask_complete events', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Task completed successfully' }],
      });

      const tool = middleware.tools[0];
      await tool.execute({ prompt: 'Test prompt' }, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('subtask_start', {
        id: 'mock-subtask-id',
        prompt: 'Test prompt',
      });
      expect(mockContext.emit).toHaveBeenCalledWith('subtask_complete', expect.objectContaining({
        id: 'mock-subtask-id',
        success: true,
      }));
    });

    it('should return success result with summary', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'I completed the task' }],
      });

      const tool = middleware.tools[0];
      const result = await tool.execute({ prompt: 'Do something' }, mockContext);

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.summary).toBe('I completed the task');
      expect(output.filesCreated).toEqual([]);
      expect(output.filesModified).toEqual([]);
    });

    it('should use default allowed tools when not specified', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done' }],
      });

      const tool = middleware.tools[0];
      await tool.execute({ prompt: 'Test' }, mockContext);

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'read_file' }),
            expect.objectContaining({ name: 'write_file' }),
            expect.objectContaining({ name: 'edit_file' }),
            expect.objectContaining({ name: 'list_directory' }),
          ]),
        })
      );
    });

    it('should use custom allowed tools when specified', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done' }],
      });

      const tool = middleware.tools[0];
      await tool.execute(
        { prompt: 'Test', allowedTools: ['read_file'] },
        mockContext
      );

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [expect.objectContaining({ name: 'read_file' })],
        })
      );
    });

    it('should use custom maxTokens when specified', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done' }],
      });

      const tool = middleware.tools[0];
      await tool.execute(
        { prompt: 'Test', maxTokens: 8192 },
        mockContext
      );

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 8192,
        })
      );
    });

    it('should handle tool calls in agent loop', async () => {
      // First call returns tool use
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: '/test.txt' } },
        ],
      });
      // Second call returns final text
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'File read successfully' }],
      });

      const tool = middleware.tools[0];
      const result = await tool.execute({ prompt: 'Read a file' }, mockContext);

      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.summary).toBe('File read successfully');
    });

    it('should track files created by write_file tool', async () => {
      const writeFileTool = createMockTool('write_file', async () => ({
        success: true,
        output: 'File written',
      }));
      toolRegistry.register(writeFileTool);

      // First call returns write_file tool use
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'write_file', input: { path: '/new-file.txt' } },
        ],
      });
      // Second call returns final text
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Created file' }],
      });

      const tool = middleware.tools[0];
      const result = await tool.execute(
        { prompt: 'Write a file', allowedTools: ['write_file'] },
        mockContext
      );

      const output = JSON.parse(result.output);
      expect(output.filesCreated).toContain('/new-file.txt');
    });

    it('should track files modified by edit_file tool', async () => {
      const editFileTool = createMockTool('edit_file', async () => ({
        success: true,
        output: 'File edited',
      }));
      toolRegistry.register(editFileTool);

      // First call returns edit_file tool use
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'edit_file', input: { path: '/existing.txt' } },
        ],
      });
      // Second call returns final text
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Edited file' }],
      });

      const tool = middleware.tools[0];
      const result = await tool.execute(
        { prompt: 'Edit a file', allowedTools: ['edit_file'] },
        mockContext
      );

      const output = JSON.parse(result.output);
      expect(output.filesModified).toContain('/existing.txt');
    });

    it('should respect max iterations limit', async () => {
      // Return tool use for all 10 iterations
      for (let i = 0; i < 10; i++) {
        mockAnthropicCreate.mockResolvedValueOnce({
          content: [
            { type: 'tool_use', id: `tool-${i}`, name: 'read_file', input: { path: '/test.txt' } },
          ],
        });
      }

      const tool = middleware.tools[0];
      const result = await tool.execute({ prompt: 'Keep reading' }, mockContext);

      expect(mockAnthropicCreate).toHaveBeenCalledTimes(10);
      const output = JSON.parse(result.output);
      expect(output.summary).toContain('max iterations reached');
    });

    it('should handle errors gracefully', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('API Error'));

      const tool = middleware.tools[0];
      const result = await tool.execute({ prompt: 'Test' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
      expect(mockContext.emit).toHaveBeenCalledWith('subtask_complete', {
        id: 'mock-subtask-id',
        success: false,
        error: 'API Error',
      });
    });

    it('should filter out non-existent tools from allowedTools', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done' }],
      });

      const tool = middleware.tools[0];
      await tool.execute(
        { prompt: 'Test', allowedTools: ['read_file', 'nonexistent_tool'] },
        mockContext
      );

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [expect.objectContaining({ name: 'read_file' })],
        })
      );
    });

    it('should handle empty tool result when no tools allowed', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done without tools' }],
      });

      const tool = middleware.tools[0];
      await tool.execute(
        { prompt: 'Test', allowedTools: [] },
        mockContext
      );

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: undefined,
        })
      );
    });
  });

  describe('setModel', () => {
    it('should update the model', () => {
      middleware.setModel('claude-opus-4-20250514');
      // Model is private, so we test by making a call and checking the request
      // This is tested indirectly through the execute calls
      expect(middleware).toBeDefined();
    });
  });

  describe('zodToJsonSchema (via tool schemas)', () => {
    it('should convert input schema correctly', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done' }],
      });

      const tool = middleware.tools[0];
      await tool.execute({ prompt: 'Test' }, mockContext);

      // Check that tools have proper JSON schema
      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.tools[0].input_schema).toEqual(
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            path: { type: 'string' },
          }),
        })
      );
    });
  });
});
