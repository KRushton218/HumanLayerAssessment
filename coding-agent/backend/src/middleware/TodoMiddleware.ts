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
  points: z.number().min(1).max(5).optional().describe('Complexity points (1-5)'),
  parentId: z.string().optional().describe('ID of parent task for hierarchy'),
  depth: z.number().min(0).max(2).optional().describe('Hierarchy depth: 0=epic, 1=task, 2=subtask'),
});

const WriteTodosSchema = z.object({
  todos: z.array(TodoSchema),
});

const ReadTodosSchema = z.object({});

export class TodoMiddleware implements Middleware {
  name = 'TodoMiddleware';

  systemPrompt = `## Todo List (Planning Tool)
You have access to a todo list for tracking task progress. The todo list is visible to the user in a sidebar.

### Task Structure (Hierarchy)
Organize tasks in a 3-level hierarchy:
- **Level 0 (Epic)**: High-level goals (1-3 max per session). Example: "Implement user authentication"
- **Level 1 (Task)**: Concrete deliverables under an epic. Example: "Create login form component"
- **Level 2 (Subtask)**: Atomic actions under a task. Example: "Add email validation"

Use parentId to link child tasks to parents. Set depth accordingly (0, 1, or 2).

### Granularity Guidelines
- Each task should represent ~5-15 minutes of work
- If a task takes longer, break it into subtasks
- If a task takes <2 minutes, combine with related work
- Avoid tasks that are too vague ("Set up project") or too detailed ("Add semicolon")

### Complexity Points
Assign points (1-5) to indicate complexity:
- 1 pt: Trivial (rename, minor tweak)
- 2 pts: Simple (add function, fix bug)
- 3 pts: Moderate (new component, integration)
- 4 pts: Complex (multi-file changes, architecture)
- 5 pts: Major (new feature, significant refactor)

### Workflow
- Create a clear plan with write_todos BEFORE starting work
- Mark exactly ONE task as "in_progress" - this shows the user what you're doing
- Mark tasks "completed" as you finish them
- Keep descriptions short and action-oriented
- DO NOT narrate todo updates in chat - update them silently
- The in_progress task should match your current work`;

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
          points: t.points,
          parentId: t.parentId,
          depth: t.depth ?? 0,
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
