import { describe, it, expect } from 'vitest';
import { ContextManager, ContextUsage } from './ContextManager.js';

describe('ContextManager', () => {
  describe('constructor', () => {
    it('should use default values', () => {
      const manager = new ContextManager();
      expect(manager.getSoftLimit()).toBe(40);
    });

    it('should accept custom values', () => {
      const manager = new ContextManager(100000, 50, 40);
      expect(manager.getSoftLimit()).toBe(50);
    });
  });

  describe('estimateTokens', () => {
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

  describe('calculateUsage', () => {
    it('should return zero for empty messages', () => {
      const manager = new ContextManager();

      const usage = manager.calculateUsage([]);

      expect(usage.tokens).toBe(0);
      expect(usage.percentage).toBe(0);
      expect(usage.warning).toBe(false);
    });

    it('should calculate tokens from string content', () => {
      const manager = new ContextManager(1000); // 1000 max tokens

      const usage = manager.calculateUsage([
        { role: 'user', content: 'Hello' }, // 5 chars = 2 tokens (ceil(5/4))
        { role: 'assistant', content: 'Hi there' }, // 8 chars = 2 tokens
      ]);

      expect(usage.tokens).toBe(4);
      expect(usage.percentage).toBeCloseTo(0.4, 1); // 4/1000 * 100 = 0.4%
    });

    it('should calculate tokens from array content with text blocks', () => {
      const manager = new ContextManager(1000);

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
      const manager = new ContextManager(1000);

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

    it('should set warning when at warn percent', () => {
      const manager = new ContextManager(100, 40, 32); // 100 tokens, warn at 32%

      // 32 tokens = 32%
      const text = 'a'.repeat(128); // 128 chars = 32 tokens
      const usage = manager.calculateUsage([{ role: 'user', content: text }]);

      expect(usage.warning).toBe(true);
    });

    it('should not set warning below warn percent', () => {
      const manager = new ContextManager(100, 40, 32);

      // 31 tokens = 31%
      const text = 'a'.repeat(124); // 124 chars = 31 tokens
      const usage = manager.calculateUsage([{ role: 'user', content: text }]);

      expect(usage.warning).toBe(false);
    });
  });

  describe('isAtSoftLimit', () => {
    it('should return true when at soft limit', () => {
      const manager = new ContextManager(100, 40, 32);

      const usage: ContextUsage = { tokens: 40, percentage: 40, warning: true };

      expect(manager.isAtSoftLimit(usage)).toBe(true);
    });

    it('should return true when above soft limit', () => {
      const manager = new ContextManager(100, 40, 32);

      const usage: ContextUsage = { tokens: 50, percentage: 50, warning: true };

      expect(manager.isAtSoftLimit(usage)).toBe(true);
    });

    it('should return false when below soft limit', () => {
      const manager = new ContextManager(100, 40, 32);

      const usage: ContextUsage = { tokens: 39, percentage: 39, warning: true };

      expect(manager.isAtSoftLimit(usage)).toBe(false);
    });
  });

  describe('getSoftLimit', () => {
    it('should return configured soft limit', () => {
      const manager = new ContextManager(200000, 45, 35);

      expect(manager.getSoftLimit()).toBe(45);
    });
  });

  describe('realistic usage scenario', () => {
    it('should track context usage through a conversation', () => {
      const manager = new ContextManager(200000, 40, 32);

      const messages: Array<{ role: string; content: unknown }> = [];

      // Simulate conversation
      messages.push({ role: 'user', content: 'What is the weather?' });
      let usage = manager.calculateUsage(messages);
      expect(usage.warning).toBe(false);
      expect(usage.percentage).toBeLessThan(1);

      // Add a long response
      const longResponse = 'The weather forecast indicates '.repeat(100);
      messages.push({ role: 'assistant', content: longResponse });
      usage = manager.calculateUsage(messages);
      expect(usage.tokens).toBeGreaterThan(0);

      // Verify percentage calculation is reasonable
      const expectedPercentage = (usage.tokens / 200000) * 100;
      expect(usage.percentage).toBeCloseTo(expectedPercentage, 5);
    });
  });
});
