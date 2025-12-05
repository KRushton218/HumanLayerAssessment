/**
 * ContextManager - Tracks token usage for agent conversations
 *
 * Uses actual token counts from the Anthropic API rather than heuristic estimation.
 * The API provides exact input_tokens and output_tokens in streaming responses.
 */

export interface ContextUsage {
  /** Total input tokens used in this session */
  inputTokens: number;
  /** Total output tokens generated in this session */
  outputTokens: number;
  /** Combined total tokens (input + output) */
  totalTokens: number;
  /** Percentage of max context window used */
  percentage: number;
  /** Whether usage exceeds warning threshold */
  warning: boolean;
  /** Whether usage exceeds soft limit */
  atSoftLimit: boolean;
}

export interface TokenUsageUpdate {
  input_tokens: number;
  output_tokens: number;
}

// Model context window sizes (as of 2025)
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-5-20251101': 200000,
  'claude-sonnet-4-20250514': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
};

const DEFAULT_MAX_TOKENS = 200000;

export class ContextManager {
  private maxTokens: number;
  private softLimitPercent: number;
  private warnPercent: number;
  private model: string;

  // Track cumulative usage per session
  private sessionUsage = new Map<string, { inputTokens: number; outputTokens: number }>();

  constructor(
    model = 'claude-sonnet-4-20250514',
    softLimitPercent = 40,
    warnPercent = 32
  ) {
    this.model = model;
    this.maxTokens = MODEL_CONTEXT_WINDOWS[model] || DEFAULT_MAX_TOKENS;
    this.softLimitPercent = softLimitPercent;
    this.warnPercent = warnPercent;
  }

  /**
   * Update context usage with actual token counts from API response
   */
  updateUsage(sessionId: string, usage: TokenUsageUpdate): ContextUsage {
    const current = this.sessionUsage.get(sessionId) || { inputTokens: 0, outputTokens: 0 };

    // The API gives us the input tokens for this specific request (includes history)
    // and output tokens for the response. We track the latest input (which includes all history)
    // and accumulate output tokens.
    const updated = {
      inputTokens: usage.input_tokens, // Latest input includes all history
      outputTokens: current.outputTokens + usage.output_tokens, // Accumulate outputs
    };

    this.sessionUsage.set(sessionId, updated);
    return this.getUsage(sessionId);
  }

  /**
   * Get current context usage for a session
   */
  getUsage(sessionId: string): ContextUsage {
    const usage = this.sessionUsage.get(sessionId) || { inputTokens: 0, outputTokens: 0 };
    const totalTokens = usage.inputTokens + usage.outputTokens;
    const percentage = (totalTokens / this.maxTokens) * 100;

    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens,
      percentage,
      warning: percentage >= this.warnPercent,
      atSoftLimit: percentage >= this.softLimitPercent,
    };
  }

  /**
   * Reset usage tracking for a session (e.g., after checkpoint revert)
   */
  resetUsage(sessionId: string): void {
    this.sessionUsage.delete(sessionId);
  }

  /**
   * Set usage directly (e.g., when restoring from checkpoint)
   */
  setUsage(sessionId: string, inputTokens: number, outputTokens: number): void {
    this.sessionUsage.set(sessionId, { inputTokens, outputTokens });
  }

  /**
   * Update model and adjust max tokens accordingly
   */
  setModel(model: string): void {
    this.model = model;
    this.maxTokens = MODEL_CONTEXT_WINDOWS[model] || DEFAULT_MAX_TOKENS;
  }

  /**
   * Get the model's maximum context window size
   */
  getMaxTokens(): number {
    return this.maxTokens;
  }

  /**
   * Get warning threshold percentage
   */
  getWarnPercent(): number {
    return this.warnPercent;
  }

  /**
   * Get soft limit percentage
   */
  getSoftLimit(): number {
    return this.softLimitPercent;
  }

  /**
   * Check if context is at or above warning threshold
   */
  isWarning(sessionId: string): boolean {
    return this.getUsage(sessionId).warning;
  }

  /**
   * Check if context is at or above soft limit
   */
  isAtSoftLimit(sessionId: string): boolean {
    return this.getUsage(sessionId).atSoftLimit;
  }

  // ============================================================
  // LEGACY METHOD - Kept for backwards compatibility with tests
  // This heuristic method is deprecated; use updateUsage() instead
  // ============================================================

  /**
   * @deprecated Use updateUsage() with actual API token counts instead
   * Simple token estimation (characters / 4) - INACCURATE
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * @deprecated Use updateUsage() with actual API token counts instead
   * Calculate usage from message content - INACCURATE
   * This does not account for system prompts or tool definitions
   */
  calculateUsage(messages: Array<{ role: string; content: unknown }>): { tokens: number; percentage: number; warning: boolean } {
    let totalTokens = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalTokens += this.estimateTokens(message.content);
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          const contentBlock = block as { text?: string; content?: string };
          if (contentBlock.text) {
            totalTokens += this.estimateTokens(contentBlock.text);
          } else if (contentBlock.content) {
            totalTokens += this.estimateTokens(contentBlock.content);
          }
        }
      }
    }

    const percentage = (totalTokens / this.maxTokens) * 100;
    const warning = percentage >= this.warnPercent;

    return { tokens: totalTokens, percentage, warning };
  }
}
