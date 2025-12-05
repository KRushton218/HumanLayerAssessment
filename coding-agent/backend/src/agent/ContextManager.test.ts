import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from './ContextManager.js';

describe('ContextManager', () => {
  describe('constructor', () => {
    it('should use default values', () => {
      const manager = new ContextManager();
      expect(manager.getSoftLimit()).toBe(40);
      expect(manager.getWarnPercent()).toBe(32);
      expect(manager.getMaxTokens()).toBe(200000); // default for claude-sonnet-4-20250514
    });

    it('should accept custom values', () => {
      const manager = new ContextManager('claude-3-haiku-20240307', 50, 40);
      expect(manager.getSoftLimit()).toBe(50);
      expect(manager.getWarnPercent()).toBe(40);
    });

    it('should set maxTokens based on model', () => {
      const manager = new ContextManager('claude-3-opus-20240229');
      expect(manager.getMaxTokens()).toBe(200000);
    });
  });

  describe('updateUsage and getUsage', () => {
    let manager: ContextManager;

    beforeEach(() => {
      manager = new ContextManager('claude-sonnet-4-20250514', 40, 32);
    });

    it('should return zero for new session', () => {
      const usage = manager.getUsage('session-1');

      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.percentage).toBe(0);
      expect(usage.warning).toBe(false);
      expect(usage.atSoftLimit).toBe(false);
    });

    it('should update usage with actual token counts', () => {
      const usage = manager.updateUsage('session-1', {
        input_tokens: 1000,
        output_tokens: 500,
      });

      expect(usage.inputTokens).toBe(1000);
      expect(usage.outputTokens).toBe(500);
      expect(usage.totalTokens).toBe(1500);
      expect(usage.percentage).toBeCloseTo(0.75, 2); // 1500/200000 * 100
    });

    it('should accumulate output tokens across calls', () => {
      manager.updateUsage('session-1', { input_tokens: 1000, output_tokens: 500 });
      const usage = manager.updateUsage('session-1', { input_tokens: 2000, output_tokens: 300 });

      // Input tokens are replaced (latest includes history)
      expect(usage.inputTokens).toBe(2000);
      // Output tokens are accumulated
      expect(usage.outputTokens).toBe(800);
      expect(usage.totalTokens).toBe(2800);
    });

    it('should set warning when at warn percent', () => {
      // 32% of 200000 = 64000 tokens
      const usage = manager.updateUsage('session-1', {
        input_tokens: 60000,
        output_tokens: 5000, // total = 65000 > 64000
      });

      expect(usage.warning).toBe(true);
    });

    it('should set atSoftLimit when at soft limit', () => {
      // 40% of 200000 = 80000 tokens
      const usage = manager.updateUsage('session-1', {
        input_tokens: 75000,
        output_tokens: 6000, // total = 81000 > 80000
      });

      expect(usage.atSoftLimit).toBe(true);
    });

    it('should track multiple sessions independently', () => {
      manager.updateUsage('session-1', { input_tokens: 1000, output_tokens: 500 });
      manager.updateUsage('session-2', { input_tokens: 2000, output_tokens: 1000 });

      const usage1 = manager.getUsage('session-1');
      const usage2 = manager.getUsage('session-2');

      expect(usage1.totalTokens).toBe(1500);
      expect(usage2.totalTokens).toBe(3000);
    });
  });

  describe('resetUsage', () => {
    it('should reset usage for a session', () => {
      const manager = new ContextManager();
      manager.updateUsage('session-1', { input_tokens: 1000, output_tokens: 500 });

      manager.resetUsage('session-1');
      const usage = manager.getUsage('session-1');

      expect(usage.totalTokens).toBe(0);
    });
  });

  describe('setUsage', () => {
    it('should set usage directly', () => {
      const manager = new ContextManager();
      manager.setUsage('session-1', 5000, 2000);

      const usage = manager.getUsage('session-1');

      expect(usage.inputTokens).toBe(5000);
      expect(usage.outputTokens).toBe(2000);
      expect(usage.totalTokens).toBe(7000);
    });
  });

  describe('setModel', () => {
    it('should update maxTokens when model changes', () => {
      const manager = new ContextManager('claude-3-haiku-20240307');
      expect(manager.getMaxTokens()).toBe(200000);

      manager.setModel('claude-3-opus-20240229');
      expect(manager.getMaxTokens()).toBe(200000);
    });
  });

  describe('isWarning and isAtSoftLimit', () => {
    it('should check warning status for session', () => {
      const manager = new ContextManager('claude-sonnet-4-20250514', 40, 32);

      // Below warning (32%)
      manager.updateUsage('session-1', { input_tokens: 60000, output_tokens: 0 });
      expect(manager.isWarning('session-1')).toBe(false);

      // At warning
      manager.updateUsage('session-1', { input_tokens: 64000, output_tokens: 0 });
      expect(manager.isWarning('session-1')).toBe(true);
    });

    it('should check soft limit status for session', () => {
      const manager = new ContextManager('claude-sonnet-4-20250514', 40, 32);

      // Below soft limit (40%)
      manager.updateUsage('session-1', { input_tokens: 75000, output_tokens: 0 });
      expect(manager.isAtSoftLimit('session-1')).toBe(false);

      // At soft limit
      manager.updateUsage('session-1', { input_tokens: 80000, output_tokens: 0 });
      expect(manager.isAtSoftLimit('session-1')).toBe(true);
    });
  });

  // ============================================================
  // LEGACY METHOD TESTS - for backwards compatibility
  // These test the deprecated heuristic methods
  // ============================================================

  describe('estimateTokens (deprecated)', () => {
    it('should estimate tokens as characters / 4', () => {
      const manager = new ContextManager();

      expect(manager.estimateTokens('')).toBe(0);
      expect(manager.estimateTokens('a')).toBe(1);
      expect(manager.estimateTokens('abcd')).toBe(1);
      expect(manager.estimateTokens('abcde')).toBe(2);
      expect(manager.estimateTokens('12345678')).toBe(2);
    });

    it('should handle long text', () => {
      const manager = new ContextManager();
      const longText = 'a'.repeat(1000);

      expect(manager.estimateTokens(longText)).toBe(250);
    });
  });

  describe('calculateUsage (deprecated)', () => {
    it('should return zero for empty messages', () => {
      const manager = new ContextManager();

      const usage = manager.calculateUsage([]);

      expect(usage.tokens).toBe(0);
      expect(usage.percentage).toBe(0);
      expect(usage.warning).toBe(false);
    });

    it('should calculate tokens from string content', () => {
      const manager = new ContextManager();

      const usage = manager.calculateUsage([
        { role: 'user', content: 'Hello' }, // 5 chars = 2 tokens (ceil(5/4))
        { role: 'assistant', content: 'Hi there' }, // 8 chars = 2 tokens
      ]);

      expect(usage.tokens).toBe(4);
    });

    it('should calculate tokens from array content with text blocks', () => {
      const manager = new ContextManager();

      const usage = manager.calculateUsage([
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello' }, // 5 chars = 2 tokens
            { type: 'text', text: 'World' }, // 5 chars = 2 tokens
          ],
        },
      ]);

      expect(usage.tokens).toBe(4);
    });

    it('should calculate tokens from tool_result content', () => {
      const manager = new ContextManager();

      const usage = manager.calculateUsage([
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: '123', content: 'Result text here' }, // 16 chars = 4 tokens
          ],
        },
      ]);

      expect(usage.tokens).toBe(4);
    });
  });

  describe('realistic usage scenario', () => {
    it('should track context usage through multiple API calls', () => {
      const manager = new ContextManager('claude-sonnet-4-20250514', 40, 32);
      const sessionId = 'realistic-session';

      // First API call
      let usage = manager.updateUsage(sessionId, {
        input_tokens: 150,  // User message + system prompt + tools
        output_tokens: 50,  // Assistant response
      });
      expect(usage.warning).toBe(false);
      expect(usage.totalTokens).toBe(200);

      // Second API call (input includes all history)
      usage = manager.updateUsage(sessionId, {
        input_tokens: 350,  // Previous messages + new user message
        output_tokens: 100, // New assistant response
      });
      expect(usage.inputTokens).toBe(350); // Latest input
      expect(usage.outputTokens).toBe(150); // Accumulated output (50 + 100)
      expect(usage.totalTokens).toBe(500);

      // Third API call with tool use
      usage = manager.updateUsage(sessionId, {
        input_tokens: 600,  // All history + tool results
        output_tokens: 200, // Response after tool use
      });
      expect(usage.inputTokens).toBe(600);
      expect(usage.outputTokens).toBe(350); // 150 + 200
      expect(usage.totalTokens).toBe(950);
    });
  });
});
