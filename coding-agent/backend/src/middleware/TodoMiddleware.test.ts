import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TodoMiddleware } from './TodoMiddleware.js';
import { AgentState } from './types.js';
import { ToolContext } from '../tools/ToolRegistry.js';

describe('TodoMiddleware', () => {
  let middleware: TodoMiddleware;
  let mockContext: ToolContext;

  beforeEach(() => {
    middleware = new TodoMiddleware();
    mockContext = {
      sessionId: 'test-session-' + Math.random(),
      workingDirectory: '/test',
      emit: vi.fn(),
    };
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(middleware.name).toBe('TodoMiddleware');
    });

    it('should have system prompt with todo guidance', () => {
      expect(middleware.systemPrompt).toContain('Todo List');
      expect(middleware.systemPrompt).toContain('write_todos');
      expect(middleware.systemPrompt).toContain('read_todos');
    });

    it('should provide two tools', () => {
      expect(middleware.tools).toHaveLength(2);
      expect(middleware.tools.map(t => t.name)).toContain('write_todos');
      expect(middleware.tools.map(t => t.name)).toContain('read_todos');
    });
  });

  describe('write_todos tool', () => {
    it('should write todos and emit update event', async () => {
      const writeTodos = middleware.tools.find(t => t.name === 'write_todos')!;

      const result = await writeTodos.execute(
        {
          todos: [
            { content: 'Task 1', status: 'pending' },
            { content: 'Task 2', status: 'in_progress' },
          ],
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('2 items');
      expect(mockContext.emit).toHaveBeenCalledWith('todo_update', expect.any(Object));
    });

    it('should generate IDs for todos without them', async () => {
      const writeTodos = middleware.tools.find(t => t.name === 'write_todos')!;

      await writeTodos.execute(
        {
          todos: [{ content: 'Task without ID', status: 'pending' }],
        },
        mockContext
      );

      const todos = middleware.getTodos(mockContext.sessionId);
      expect(todos[0].id).toBeDefined();
      expect(todos[0].id.length).toBeGreaterThan(0);
    });

    it('should preserve existing IDs', async () => {
      const writeTodos = middleware.tools.find(t => t.name === 'write_todos')!;

      await writeTodos.execute(
        {
          todos: [{ id: 'custom-id', content: 'Task with ID', status: 'pending' }],
        },
        mockContext
      );

      const todos = middleware.getTodos(mockContext.sessionId);
      expect(todos[0].id).toBe('custom-id');
    });

    it('should replace entire todo list', async () => {
      const writeTodos = middleware.tools.find(t => t.name === 'write_todos')!;

      // Write initial todos
      await writeTodos.execute(
        {
          todos: [
            { content: 'Task 1', status: 'pending' },
            { content: 'Task 2', status: 'pending' },
          ],
        },
        mockContext
      );

      // Write new todos (should replace)
      await writeTodos.execute(
        {
          todos: [{ content: 'New Task', status: 'completed' }],
        },
        mockContext
      );

      const todos = middleware.getTodos(mockContext.sessionId);
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('New Task');
    });
  });

  describe('read_todos tool', () => {
    it('should return empty array when no todos exist', async () => {
      const readTodos = middleware.tools.find(t => t.name === 'read_todos')!;

      const result = await readTodos.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(JSON.parse(result.output)).toEqual([]);
    });

    it('should return existing todos', async () => {
      const writeTodos = middleware.tools.find(t => t.name === 'write_todos')!;
      const readTodos = middleware.tools.find(t => t.name === 'read_todos')!;

      await writeTodos.execute(
        {
          todos: [
            { content: 'Task 1', status: 'pending' },
            { content: 'Task 2', status: 'completed' },
          ],
        },
        mockContext
      );

      const result = await readTodos.execute({}, mockContext);
      const todos = JSON.parse(result.output);

      expect(todos).toHaveLength(2);
      expect(todos[0].content).toBe('Task 1');
      expect(todos[1].status).toBe('completed');
    });
  });

  describe('getTodos', () => {
    it('should return empty array for unknown session', () => {
      const todos = middleware.getTodos('unknown-session');
      expect(todos).toEqual([]);
    });

    it('should return todos for session', async () => {
      const writeTodos = middleware.tools.find(t => t.name === 'write_todos')!;

      await writeTodos.execute(
        {
          todos: [{ content: 'Test', status: 'pending' }],
        },
        mockContext
      );

      const todos = middleware.getTodos(mockContext.sessionId);
      expect(todos).toHaveLength(1);
    });
  });

  describe('beforeInvoke hook', () => {
    it('should sync todos from store to state', async () => {
      const writeTodos = middleware.tools.find(t => t.name === 'write_todos')!;

      await writeTodos.execute(
        {
          todos: [
            { content: 'Task 1', status: 'pending' },
            { content: 'Task 2', status: 'in_progress' },
          ],
        },
        mockContext
      );

      const state: AgentState = {
        sessionId: mockContext.sessionId,
        messages: [],
        todos: [],
        files: new Map(),
        checkpoints: new Map(),
        contextUsage: { tokens: 0, percentage: 0 },
      };

      const result = middleware.beforeInvoke(state);

      expect(result.todos).toHaveLength(2);
      expect(result.todos[0].content).toBe('Task 1');
    });

    it('should return empty todos for new session', () => {
      const state: AgentState = {
        sessionId: 'new-session',
        messages: [],
        todos: [],
        files: new Map(),
        checkpoints: new Map(),
        contextUsage: { tokens: 0, percentage: 0 },
      };

      const result = middleware.beforeInvoke(state);

      expect(result.todos).toEqual([]);
    });
  });

  describe('session isolation', () => {
    it('should isolate todos between sessions', async () => {
      const writeTodos = middleware.tools.find(t => t.name === 'write_todos')!;

      const context1: ToolContext = {
        sessionId: 'session-1',
        workingDirectory: '/test',
        emit: vi.fn(),
      };

      const context2: ToolContext = {
        sessionId: 'session-2',
        workingDirectory: '/test',
        emit: vi.fn(),
      };

      await writeTodos.execute(
        { todos: [{ content: 'Session 1 task', status: 'pending' }] },
        context1
      );

      await writeTodos.execute(
        { todos: [{ content: 'Session 2 task', status: 'completed' }] },
        context2
      );

      const todos1 = middleware.getTodos('session-1');
      const todos2 = middleware.getTodos('session-2');

      expect(todos1).toHaveLength(1);
      expect(todos1[0].content).toBe('Session 1 task');

      expect(todos2).toHaveLength(1);
      expect(todos2[0].content).toBe('Session 2 task');
    });
  });
});
