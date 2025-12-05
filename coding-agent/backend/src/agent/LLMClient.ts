import Anthropic from '@anthropic-ai/sdk';

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

export interface LLMClientConfig {
  model?: string;
  maxTokens?: number;
  apiKey?: string;
}

export interface StreamEvent {
  type: 'text' | 'tool_use' | 'message_stop' | 'content_block_stop' | 'usage_update';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export class LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private apiKey: string | undefined;

  constructor(config: LLMClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.client = new Anthropic(this.apiKey ? { apiKey: this.apiKey } : undefined);
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 8096;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.client = new Anthropic({ apiKey });
  }

  hasApiKey(): boolean {
    return !!(this.apiKey || process.env.ANTHROPIC_API_KEY);
  }

  async *streamMessage(
    systemPrompt: string,
    messages: Message[],
    tools: Array<{ name: string; description: string; input_schema: object }>
  ): AsyncGenerator<StreamEvent> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content as Anthropic.MessageParam['content'],
      })),
      tools: tools.length > 0 ? tools as Anthropic.Tool[] : undefined,
    });

    // Track usage from streaming events
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === 'message_start') {
        // message_start contains initial usage with input_tokens
        const messageEvent = event as { type: 'message_start'; message: { usage?: { input_tokens: number; output_tokens: number } } };
        if (messageEvent.message?.usage) {
          inputTokens = messageEvent.message.usage.input_tokens;
          outputTokens = messageEvent.message.usage.output_tokens;
        }
      } else if (event.type === 'message_delta') {
        // message_delta contains cumulative output_tokens
        const deltaEvent = event as { type: 'message_delta'; usage?: { output_tokens: number } };
        if (deltaEvent.usage) {
          outputTokens = deltaEvent.usage.output_tokens;
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string; partial_json?: string };
        if (delta.type === 'text_delta') {
          yield { type: 'text', text: delta.text };
        } else if (delta.type === 'input_json_delta') {
          // Tool input streaming - accumulate in caller
          yield { type: 'tool_use', text: delta.partial_json };
        }
      } else if (event.type === 'content_block_start') {
        const block = event.content_block as { type: string; id?: string; name?: string };
        if (block.type === 'tool_use') {
          yield {
            type: 'tool_use',
            id: block.id,
            name: block.name,
          };
        }
      } else if (event.type === 'content_block_stop') {
        yield { type: 'content_block_stop' };
      } else if (event.type === 'message_stop') {
        // Emit final usage before message_stop
        yield {
          type: 'usage_update',
          usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          },
        };
        yield { type: 'message_stop' };
      }
    }
  }

  /**
   * Count tokens for a message before sending (uses API call)
   * Useful for pre-flight checks on large messages
   *
   * Note: Requires SDK with beta.messages.countTokens support
   * For SDK v0.32.0, use client.beta.messages.countTokens with betas: ["token-counting-2024-11-01"]
   */
  async countTokens(
    systemPrompt: string,
    messages: Message[],
    tools: Array<{ name: string; description: string; input_schema: object }>
  ): Promise<number> {
    // Use beta API for token counting (available in SDK 0.32.0+)
    const response = await this.client.beta.messages.countTokens({
      betas: ['token-counting-2024-11-01'],
      model: this.model,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content as Anthropic.MessageParam['content'],
      })),
      tools: tools.length > 0 ? tools as Anthropic.Tool[] : undefined,
    });
    return response.input_tokens;
  }

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }
}
