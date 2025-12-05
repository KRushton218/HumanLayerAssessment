import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessage } from './ChatMessage';

describe('ChatMessage', () => {
  describe('rendering', () => {
    it('should render user message with correct styling', () => {
      const { container } = render(<ChatMessage role="user" content="Hello world" />);

      expect(screen.getByText('Hello world')).toBeInTheDocument();
      // User messages have blue background - find the bubble container
      const bubble = container.querySelector('.bg-blue-600.rounded-2xl');
      expect(bubble).toBeInTheDocument();
    });

    it('should render assistant message with correct styling', () => {
      const { container } = render(<ChatMessage role="assistant" content="Hi there" />);

      expect(screen.getByText('Hi there')).toBeInTheDocument();
      // Assistant messages have white background with border
      const bubble = container.querySelector('.bg-white.rounded-2xl');
      expect(bubble).toBeInTheDocument();
    });

    it('should show streaming cursor when isStreaming is true', () => {
      render(<ChatMessage role="assistant" content="Typing..." isStreaming />);

      // Should have the animated pulse element
      const streamingCursor = document.querySelector('.animate-pulse');
      expect(streamingCursor).toBeInTheDocument();
    });

    it('should not show streaming cursor when isStreaming is false', () => {
      render(<ChatMessage role="assistant" content="Done" isStreaming={false} />);

      const streamingCursor = document.querySelector('.animate-pulse');
      expect(streamingCursor).not.toBeInTheDocument();
    });
  });

  describe('copy functionality', () => {
    it('should have copy button that copies content', async () => {
      render(<ChatMessage role="assistant" content="Copy me" />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      fireEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy me');
    });

    it('should not show copy button when streaming', () => {
      render(<ChatMessage role="assistant" content="Typing" isStreaming />);

      const copyButton = screen.queryByRole('button', { name: /copy/i });
      expect(copyButton).not.toBeInTheDocument();
    });
  });

  describe('avatar', () => {
    it('should show User icon for user messages', () => {
      const { container } = render(<ChatMessage role="user" content="Test" />);

      // User avatar has blue background
      const avatar = container.querySelector('.bg-blue-600');
      expect(avatar).toBeInTheDocument();
    });

    it('should show Bot icon for assistant messages', () => {
      const { container } = render(<ChatMessage role="assistant" content="Test" />);

      // Assistant avatar has white background
      const avatar = container.querySelector('.border-slate-200');
      expect(avatar).toBeInTheDocument();
    });
  });
});
