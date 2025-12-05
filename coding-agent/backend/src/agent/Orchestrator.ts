import { MiddlewareManager } from '../middleware/MiddlewareManager.js';
import { AgentState } from '../middleware/types.js';
import { ToolContext } from '../tools/ToolRegistry.js';
import { LLMClient, ContentBlock, Message } from './LLMClient.js';
import { ContextManager } from './ContextManager.js';
import { CheckpointManager } from './CheckpointManager.js';
import { CheckpointNameGenerator } from './CheckpointNameGenerator.js';
import { ApprovalManager } from '../approval/index.js';

export interface OrchestratorConfig {
  workingDirectory: string;
  emit: (event: string, data: unknown) => void;
}

export class Orchestrator {
  private middlewareManager: MiddlewareManager;
  private llmClient: LLMClient;
  private contextManager: ContextManager;
  private checkpointManager: CheckpointManager;
  private checkpointNameGenerator: CheckpointNameGenerator;
  private approvalManager: ApprovalManager;
  private states = new Map<string, AgentState>();

  constructor(
    middlewareManager: MiddlewareManager,
    llmClient: LLMClient,
    contextManager: ContextManager,
    checkpointManager: CheckpointManager,
    approvalManager: ApprovalManager
  ) {
    this.middlewareManager = middlewareManager;
    this.llmClient = llmClient;
    this.contextManager = contextManager;
    this.checkpointManager = checkpointManager;
    this.checkpointNameGenerator = new CheckpointNameGenerator();
    this.approvalManager = approvalManager;
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

    // Track all text and tool calls across iterations for checkpoint naming
    let allTextContent = '';
    const allToolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];

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
        } else if (event.type === 'usage_update' && event.usage) {
          // Update context usage with actual token counts from API
          const contextUsage = this.contextManager.updateUsage(sessionId, event.usage);
          state.contextUsage = {
            tokens: contextUsage.totalTokens,
            percentage: contextUsage.percentage,
          };
          // Emit detailed context update to frontend
          config.emit('context_update', {
            inputTokens: contextUsage.inputTokens,
            outputTokens: contextUsage.outputTokens,
            totalTokens: contextUsage.totalTokens,
            percentage: contextUsage.percentage,
            warning: contextUsage.warning,
            atSoftLimit: contextUsage.atSoftLimit,
            maxTokens: this.contextManager.getMaxTokens(),
          });
        }
      }

      // Accumulate text for checkpoint naming
      allTextContent += textContent;

      // Build assistant message content
      const assistantContent: ContentBlock[] = [];
      if (textContent) {
        assistantContent.push({ type: 'text', text: textContent });
      }

      // Process tool calls
      if (toolCalls.length > 0) {
        continueLoop = true;

        for (const tc of toolCalls) {
          // Accumulate tool calls for checkpoint naming
          const parsedInput = JSON.parse(tc.input || '{}');
          allToolCalls.push({ name: tc.name, input: parsedInput });

          assistantContent.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: parsedInput,
          });
        }

        // Add assistant message with tool calls
        state.messages.push({ role: 'assistant', content: assistantContent });

        // Execute tools and collect results
        const toolResults: ContentBlock[] = [];
        for (let i = 0; i < toolCalls.length; i++) {
          const tc = toolCalls[i];
          const tool = toolRegistry.get(tc.name);
          if (tool) {
            // Use the input we already parsed and added to allToolCalls
            const input = allToolCalls[allToolCalls.length - toolCalls.length + i].input;

            // Check if approval is needed
            const { needsApproval, request } = this.approvalManager.checkApproval(
              sessionId,
              tc.name,
              input
            );

            let approved = true;
            if (needsApproval && request) {
              // Emit approval request to frontend
              config.emit('approval_required', request);

              // Wait for user response
              approved = await this.approvalManager.waitForApproval(request);

              // Emit approval result
              config.emit('approval_result', {
                requestId: request.requestId,
                approved,
              });
            }

            if (approved) {
              const result = await tool.execute(input, toolContext);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: result.success ? result.output : `Error: ${result.error}`,
              });
            } else {
              // Tool was denied
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: 'Error: Tool execution denied by user',
              });
            }
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

      // Note: Context usage is now updated in real-time via usage_update events
      // from the LLM streaming response, providing accurate token counts
    }

    // Run after hooks
    state = await this.middlewareManager.runAfterHooks(state);
    this.states.set(sessionId, state);

    // Generate checkpoint name asynchronously (non-blocking)
    this.generateCheckpointName(
      sessionId,
      checkpointId,
      userMessage,
      allTextContent,
      allToolCalls,
      config.emit
    );
  }

  private async generateCheckpointName(
    sessionId: string,
    checkpointId: string,
    userMessage: string,
    assistantText: string,
    toolCalls: Array<{ name: string; input: Record<string, unknown> }>,
    emit: (event: string, data: unknown) => void
  ): Promise<void> {
    try {
      const { name, summary } = await this.checkpointNameGenerator.generateName({
        userMessage,
        assistantText,
        toolCalls,
      });

      this.checkpointManager.updateCheckpointName(sessionId, checkpointId, name, summary);
      emit('checkpoint_updated', { id: checkpointId, name, actionSummary: summary });
    } catch (err) {
      console.error('Failed to generate checkpoint name:', err);
    }
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
    this.contextManager.setModel(model);
  }

  setApiKey(apiKey: string): void {
    this.llmClient.setApiKey(apiKey);
    this.checkpointNameGenerator.setApiKey(apiKey);
  }

  hasApiKey(): boolean {
    return this.llmClient.hasApiKey();
  }

  getApprovalManager(): ApprovalManager {
    return this.approvalManager;
  }
}
