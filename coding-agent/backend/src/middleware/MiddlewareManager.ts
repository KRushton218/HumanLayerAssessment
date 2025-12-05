import { Middleware, AgentState } from './types.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';

export class MiddlewareManager {
  private middlewares: Middleware[] = [];
  private toolRegistry: ToolRegistry;

  constructor() {
    this.toolRegistry = new ToolRegistry();
  }

  register(middleware: Middleware): void {
    this.middlewares.push(middleware);

    // Register all tools from middleware
    for (const tool of middleware.tools) {
      this.toolRegistry.register(tool);
    }
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  composeSystemPrompt(): string {
    const CORE_IDENTITY = `You are a skilled software engineer working on coding tasks.
You approach problems methodically, breaking them into manageable steps.

## Key Behaviors
1. ALWAYS update your todo list before and after each task
2. Use the filesystem for context offloading - write notes, plans, and intermediate results
3. For complex subtasks, delegate to spawn_subtask to keep your context clean
4. Explain your reasoning before taking actions`;

    const TASK_GUIDANCE = `## General Guidelines
- Be thorough but efficient
- Verify your work before marking tasks complete
- Ask for clarification if requirements are unclear
- Keep the user informed of progress`;

    const middlewarePrompts = this.middlewares
      .map(m => m.systemPrompt)
      .filter(p => p.length > 0);

    return [CORE_IDENTITY, ...middlewarePrompts, TASK_GUIDANCE].join('\n\n---\n\n');
  }

  async runBeforeHooks(state: AgentState): Promise<AgentState> {
    let currentState = state;
    for (const middleware of this.middlewares) {
      if (middleware.beforeInvoke) {
        currentState = await middleware.beforeInvoke(currentState);
      }
    }
    return currentState;
  }

  async runAfterHooks(state: AgentState): Promise<AgentState> {
    let currentState = state;
    for (const middleware of this.middlewares) {
      if (middleware.afterInvoke) {
        currentState = await middleware.afterInvoke(currentState);
      }
    }
    return currentState;
  }
}
