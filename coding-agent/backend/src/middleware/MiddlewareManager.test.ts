import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { MiddlewareManager } from './MiddlewareManager.js';
import { Middleware, AgentState } from './types.js';
import { ToolDefinition, ToolResult } from '../tools/ToolRegistry.js';

describe('MiddlewareManager', () => {
  const createMockState = (): AgentState => ({
    sessionId: 'test-session',
    messages: [],
    todos: [],
    files: new Map(),
    checkpoints: new Map(),
    contextUsage: { tokens: 0, percentage: 0 },
  });

  const createMockTool = (name: string): ToolDefinition => ({
    name,
    description: `Mock tool: ${name}`,
    inputSchema: z.object({}),
    execute: async (): Promise<ToolResult> => {
      return { success: true, output: 'done' };
    },
  });

  const createMockMiddleware = (name: string, systemPrompt: string = ''): Middleware => ({
    name,
    tools: [createMockTool(`${name}_tool`)],
    systemPrompt,
  });

  describe('register', () => {
    it('should register middleware', () => {
      const manager = new MiddlewareManager();
      const middleware = createMockMiddleware('test');

      manager.register(middleware);

      const registry = manager.getToolRegistry();
      expect(registry.get('test_tool')).toBeDefined();
    });

    it('should register all tools from middleware', () => {
      const manager = new MiddlewareManager();
      const middleware: Middleware = {
        name: 'multi_tool',
        tools: [createMockTool('tool1'), createMockTool('tool2'), createMockTool('tool3')],
        systemPrompt: '',
      };

      manager.register(middleware);

      const registry = manager.getToolRegistry();
      expect(registry.get('tool1')).toBeDefined();
      expect(registry.get('tool2')).toBeDefined();
      expect(registry.get('tool3')).toBeDefined();
    });
  });

  describe('getToolRegistry', () => {
    it('should return tool registry with registered tools', () => {
      const manager = new MiddlewareManager();
      manager.register(createMockMiddleware('m1'));
      manager.register(createMockMiddleware('m2'));

      const registry = manager.getToolRegistry();
      const tools = registry.getAll();

      expect(tools).toHaveLength(2);
    });
  });

  describe('composeSystemPrompt', () => {
    it('should include core identity', () => {
      const manager = new MiddlewareManager();

      const prompt = manager.composeSystemPrompt();

      expect(prompt).toContain('skilled software engineer');
    });

    it('should include task guidance', () => {
      const manager = new MiddlewareManager();

      const prompt = manager.composeSystemPrompt();

      expect(prompt).toContain('General Guidelines');
    });

    it('should include middleware system prompts', () => {
      const manager = new MiddlewareManager();
      manager.register(createMockMiddleware('m1', 'Custom prompt for m1'));
      manager.register(createMockMiddleware('m2', 'Custom prompt for m2'));

      const prompt = manager.composeSystemPrompt();

      expect(prompt).toContain('Custom prompt for m1');
      expect(prompt).toContain('Custom prompt for m2');
    });

    it('should skip empty system prompts', () => {
      const manager = new MiddlewareManager();
      manager.register(createMockMiddleware('empty', ''));
      manager.register(createMockMiddleware('valid', 'Valid prompt'));

      const prompt = manager.composeSystemPrompt();

      expect(prompt).toContain('Valid prompt');
      // Empty prompts are filtered out, so there shouldn't be extra separators
    });
  });

  describe('runBeforeHooks', () => {
    it('should run beforeInvoke hooks in order', async () => {
      const manager = new MiddlewareManager();
      const callOrder: string[] = [];

      const m1: Middleware = {
        name: 'm1',
        tools: [],
        systemPrompt: '',
        beforeInvoke: (state) => {
          callOrder.push('m1');
          state.todos.push({ id: '1', content: 'from m1', status: 'pending' });
          return state;
        },
      };

      const m2: Middleware = {
        name: 'm2',
        tools: [],
        systemPrompt: '',
        beforeInvoke: (state) => {
          callOrder.push('m2');
          state.todos.push({ id: '2', content: 'from m2', status: 'pending' });
          return state;
        },
      };

      manager.register(m1);
      manager.register(m2);

      const state = createMockState();
      const result = await manager.runBeforeHooks(state);

      expect(callOrder).toEqual(['m1', 'm2']);
      expect(result.todos).toHaveLength(2);
    });

    it('should skip middleware without beforeInvoke', async () => {
      const manager = new MiddlewareManager();
      manager.register(createMockMiddleware('no_hook'));

      const state = createMockState();
      const result = await manager.runBeforeHooks(state);

      expect(result).toEqual(state);
    });

    it('should handle async beforeInvoke', async () => {
      const manager = new MiddlewareManager();
      const middleware: Middleware = {
        name: 'async_middleware',
        tools: [],
        systemPrompt: '',
        beforeInvoke: async (state) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          state.todos.push({ id: '1', content: 'async todo', status: 'pending' });
          return state;
        },
      };

      manager.register(middleware);

      const state = createMockState();
      const result = await manager.runBeforeHooks(state);

      expect(result.todos).toHaveLength(1);
      expect(result.todos[0].content).toBe('async todo');
    });
  });

  describe('runAfterHooks', () => {
    it('should run afterInvoke hooks in order', async () => {
      const manager = new MiddlewareManager();
      const callOrder: string[] = [];

      const m1: Middleware = {
        name: 'm1',
        tools: [],
        systemPrompt: '',
        afterInvoke: (state) => {
          callOrder.push('m1');
          return state;
        },
      };

      const m2: Middleware = {
        name: 'm2',
        tools: [],
        systemPrompt: '',
        afterInvoke: (state) => {
          callOrder.push('m2');
          return state;
        },
      };

      manager.register(m1);
      manager.register(m2);

      const state = createMockState();
      await manager.runAfterHooks(state);

      expect(callOrder).toEqual(['m1', 'm2']);
    });

    it('should skip middleware without afterInvoke', async () => {
      const manager = new MiddlewareManager();
      manager.register(createMockMiddleware('no_hook'));

      const state = createMockState();
      const result = await manager.runAfterHooks(state);

      expect(result).toEqual(state);
    });
  });
});
