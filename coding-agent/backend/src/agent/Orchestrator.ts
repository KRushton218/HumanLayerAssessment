import { MiddlewareManager } from '../middleware/MiddlewareManager.js';
import { AgentState } from '../middleware/types.js';
import { ToolContext } from '../tools/ToolRegistry.js';
import { LLMClient, ContentBlock, Message } from './LLMClient.js';
import { ContextManager } from './ContextManager.js';
import { CheckpointManager } from './CheckpointManager.js';

export interface OrchestratorConfig {
  workingDirectory: string;
  emit: (event: string, data: unknown) => void;
}

export class Orchestrator {
  private middlewareManager: MiddlewareManager;
  private llmClient: LLMClient;
  private contextManager: ContextManager;
  private checkpointManager: CheckpointManager;
  private states = new Map<string, AgentState>();

  constructor(
    middlewareManager: MiddlewareManager,
    llmClient: LLMClient,
    contextManager: ContextManager,
    checkpointManager: CheckpointManager
  ) {
    this.middlewareManager = middlewareManager;
    this.llmClient = llmClient;
    this.contextManager = contextManager;
    this.checkpointManager = checkpointManager;
  }

  getOrCreateState(sessionId: string): AgentState {
    if (!this.states.has(sessionId)) {
      this.states.set(sessionId, {
        sessionId,
        messages: [],
        todos: [],
        files: new Map(),
        checkpoints: new Map(),
        contextUsage: { tokens: 0, percentage: 0 },
      });
    }
    return this.states.get(sessionId)!;
  }

  async processMessage(
    sessionId: string,
    userMessage: string,
    config: OrchestratorConfig
  ): Promise<void> {
    let state = this.getOrCreateState(sessionId);

    // Add user message
    state.messages.push({ role: 'user', content: userMessage });

    // Create checkpoint before processing
    const checkpointId = this.checkpointManager.createCheckpoint(state);
    config.emit('checkpoint_created', { id: checkpointId });

    // Run before hooks
    state = await this.middlewareManager.runBeforeHooks(state);

    const systemPrompt = this.middlewareManager.composeSystemPrompt();
    const toolRegistry = this.middlewareManager.getToolRegistry();
    const tools = toolRegistry.getToolSchemas();

    const toolContext: ToolContext = {
      sessionId,
      workingDirectory: config.workingDirectory,
      emit: config.emit,
    };

    // Agent loop - continue until no more tool calls
    let continueLoop = true;
    while (continueLoop) {
      continueLoop = false;

      // Collect streamed response
      let textContent = '';
      const toolCalls: Array<{ id: string; name: string; input: string }> = [];
      let currentToolCall: { id: string; name: string; input: string } | null = null;

      for await (const event of this.llmClient.streamMessage(
        systemPrompt,
        state.messages as Message[],
        tools
      )) {
        if (event.type === 'text' && event.text) {
          textContent += event.text;
          config.emit('text', { content: event.text });
        } else if (event.type === 'tool_use') {
          if (event.id && event.name) {
            // New tool call starting
            currentToolCall = { id: event.id, name: event.name, input: '' };
          } else if (event.text && currentToolCall) {
            // Accumulating tool input JSON
            currentToolCall.input += event.text;
          }
        } else if (event.type === 'content_block_stop' && currentToolCall) {
          toolCalls.push(currentToolCall);
          currentToolCall = null;
        }
      }

      // Build assistant message content
      const assistantContent: ContentBlock[] = [];
      if (textContent) {
        assistantContent.push({ type: 'text', text: textContent });
      }

      // Process tool calls
      if (toolCalls.length > 0) {
        continueLoop = true;

        for (const tc of toolCalls) {
          assistantContent.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.input || '{}'),
          });
        }

        // Add assistant message with tool calls
        state.messages.push({ role: 'assistant', content: assistantContent });

        // Execute tools and collect results
        const toolResults: ContentBlock[] = [];
        for (const tc of toolCalls) {
          const tool = toolRegistry.get(tc.name);
          if (tool) {
            const input = JSON.parse(tc.input || '{}');
            const result = await tool.execute(input, toolContext);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: result.success ? result.output : `Error: ${result.error}`,
            });
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: `Error: Unknown tool ${tc.name}`,
            });
          }
        }

        // Add tool results as user message
        state.messages.push({ role: 'user', content: toolResults });
      } else if (textContent) {
        // No tool calls, just text
        state.messages.push({ role: 'assistant', content: textContent });
      }

      // Update context usage
      state.contextUsage = this.contextManager.calculateUsage(state.messages);
      config.emit('context_update', state.contextUsage);
    }

    // Run after hooks
    state = await this.middlewareManager.runAfterHooks(state);
    this.states.set(sessionId, state);
  }

  revertToCheckpoint(sessionId: string, checkpointId: string): boolean {
    const state = this.checkpointManager.revertToCheckpoint(sessionId, checkpointId);
    if (state) {
      this.states.set(sessionId, state);
      return true;
    }
    return false;
  }

  forkFromCheckpoint(sessionId: string, checkpointId: string, newSessionId: string): boolean {
    const state = this.checkpointManager.forkFromCheckpoint(sessionId, checkpointId, newSessionId);
    if (state) {
      this.states.set(newSessionId, state);
      return true;
    }
    return false;
  }

  getCheckpoints(sessionId: string) {
    return this.checkpointManager.listCheckpoints(sessionId);
  }

  setModel(model: string): void {
    this.llmClient.setModel(model);
  }

  setApiKey(apiKey: string): void {
    this.llmClient.setApiKey(apiKey);
  }

  hasApiKey(): boolean {
    return this.llmClient.hasApiKey();
  }
}
