export interface ContextUsage {
  tokens: number;
  percentage: number;
  warning: boolean;
}

export class ContextManager {
  private maxTokens: number;
  private softLimitPercent: number;
  private warnPercent: number;

  constructor(maxTokens = 200000, softLimitPercent = 40, warnPercent = 32) {
    this.maxTokens = maxTokens;
    this.softLimitPercent = softLimitPercent;
    this.warnPercent = warnPercent;
  }

  // Simple token estimation (characters / 4)
  // In production, use @anthropic-ai/tokenizer
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  calculateUsage(messages: Array<{ role: string; content: unknown }>): ContextUsage {
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

  isAtSoftLimit(usage: ContextUsage): boolean {
    return usage.percentage >= this.softLimitPercent;
  }

  getSoftLimit(): number {
    return this.softLimitPercent;
  }
}
