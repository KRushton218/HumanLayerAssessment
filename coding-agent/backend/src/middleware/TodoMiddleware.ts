import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Middleware, AgentState, Todo } from './types.js';
import { ToolDefinition, ToolContext, ToolResult } from '../tools/ToolRegistry.js';

// In-memory todo storage per session
const todoStore = new Map<string, Todo[]>();

const TodoSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

const WriteTodosSchema = z.object({
  todos: z.array(TodoSchema),
});

const ReadTodosSchema = z.object({});

export class TodoMiddleware implements Middleware {
  name = 'TodoMiddleware';

  systemPrompt = `## Todo List (Planning Tool)
You have access to a todo list for tracking task progress.
- Use write_todos to update your task list when starting work
- Use read_todos to check current progress
- Mark tasks in_progress BEFORE starting work on them
- Mark tasks completed IMMEDIATELY after finishing
- Break complex tasks into smaller subtasks
- Never have more than one task in_progress at a time
- Update todos frequently to show progress`;

  tools: ToolDefinition[] = [
    {
      name: 'write_todos',
      description: 'Update the todo list with new tasks or status changes. Replaces the entire todo list.',
      inputSchema: WriteTodosSchema,
      execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
        const parsed = WriteTodosSchema.parse(input);
        const todos: Todo[] = parsed.todos.map(t => ({
          id: t.id || uuidv4(),
          content: t.content,
          status: t.status,
        }));

        todoStore.set(context.sessionId, todos);

        // Emit update event
        context.emit('todo_update', { todos });

        return {
          success: true,
          output: `Updated todo list with ${todos.length} items`,
        };
      },
    },
    {
      name: 'read_todos',
      description: 'Read the current todo list to check progress',
      inputSchema: ReadTodosSchema,
      execute: async (_input: unknown, context: ToolContext): Promise<ToolResult> => {
        const todos = todoStore.get(context.sessionId) || [];

        return {
          success: true,
          output: JSON.stringify(todos, null, 2),
        };
      },
    },
  ];

  getTodos(sessionId: string): Todo[] {
    return todoStore.get(sessionId) || [];
  }

  beforeInvoke(state: AgentState): AgentState {
    // Sync todos from store to state
    state.todos = todoStore.get(state.sessionId) || [];
    return state;
  }
}
