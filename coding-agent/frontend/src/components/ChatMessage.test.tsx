import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessage } from './ChatMessage';

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

describe('ChatMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('User messages', () => {
    it('renders user message content', () => {
      render(<ChatMessage role="user" content="Hello, agent!" />);
      expect(screen.getByText('Hello, agent!')).toBeInTheDocument();
    });

    it('renders user message with right alignment styling', () => {
      render(<ChatMessage role="user" content="Test" />);
      const container = screen.getByText('Test').closest('div.flex');
      expect(container).toHaveClass('justify-end');
    });

    it('renders user avatar', () => {
      const { container } = render(<ChatMessage role="user" content="Test" />);
      const avatar = container.querySelector('.rounded-full.bg-blue-600');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('Assistant messages', () => {
    it('renders assistant message with Agent label', () => {
      render(<ChatMessage role="assistant" content="Here is my response" />);
      expect(screen.getByText('Agent')).toBeInTheDocument();
    });

    it('shows streaming indicator when isStreaming is true', () => {
      render(<ChatMessage role="assistant" content="Working on it..." isStreaming />);
      expect(screen.getByText('Working...')).toBeInTheDocument();
    });

    it('shows animated cursor when streaming', () => {
      const { container } = render(<ChatMessage role="assistant" content="Test" isStreaming />);
      const cursor = container.querySelector('.animate-pulse');
      expect(cursor).toBeInTheDocument();
    });

    it('does not show streaming indicator when not streaming', () => {
      render(<ChatMessage role="assistant" content="Done" />);
      expect(screen.queryByText('Working...')).not.toBeInTheDocument();
    });

    it('parses basic text paragraphs', () => {
      render(<ChatMessage role="assistant" content="This is a simple paragraph." />);
      expect(screen.getByText('This is a simple paragraph.')).toBeInTheDocument();
    });

    it('parses bullet lists', () => {
      const content = `- First item
- Second item
- Third item`;
      render(<ChatMessage role="assistant" content={content} />);
      expect(screen.getByText('First item')).toBeInTheDocument();
      expect(screen.getByText('Second item')).toBeInTheDocument();
      expect(screen.getByText('Third item')).toBeInTheDocument();
    });

    it('parses bold text with **', () => {
      render(<ChatMessage role="assistant" content="This is **bold** text" />);
      const boldElement = screen.getByText('bold');
      expect(boldElement.tagName).toBe('STRONG');
    });

    it('parses inline code with backticks', () => {
      render(<ChatMessage role="assistant" content="Run the `npm install` command" />);
      const codeElement = screen.getByText('npm install');
      expect(codeElement.tagName).toBe('CODE');
    });

    it('parses file paths with highlighting', () => {
      render(<ChatMessage role="assistant" content="Check the /home/user/project directory" />);
      const pathElement = screen.getByText('/home/user/project');
      expect(pathElement).toHaveClass('font-mono');
    });

    it('parses code blocks with language label', () => {
      const content = `Here is some code:
\`\`\`javascript
const x = 1;
\`\`\``;
      render(<ChatMessage role="assistant" content={content} />);
      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    });

    it('parses file listing pattern', () => {
      const content = `Files found:
- **README.md** - Documentation file
- **index.js** - Main entry point`;
      render(<ChatMessage role="assistant" content={content} />);
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('Documentation file')).toBeInTheDocument();
    });
  });

  describe('Copy functionality', () => {
    it('shows copy button for assistant messages', () => {
      render(<ChatMessage role="assistant" content="Test content" />);
      expect(screen.getByText('Copy response')).toBeInTheDocument();
    });

    it('copies content when copy response button is clicked', () => {
      render(<ChatMessage role="assistant" content="Content to copy" />);
      fireEvent.click(screen.getByText('Copy response'));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Content to copy');
    });

    it('does not show copy button when streaming', () => {
      render(<ChatMessage role="assistant" content="Streaming..." isStreaming />);
      expect(screen.queryByText('Copy response')).not.toBeInTheDocument();
    });

    it('shows copy button for code blocks', () => {
      const content = `\`\`\`
code here
\`\`\``;
      render(<ChatMessage role="assistant" content={content} />);
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });
  });
});
