import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolStatusItem } from './ToolStatusItem';
import type { ToolRun } from '../types';

describe('ToolStatusItem', () => {
  it('should render running tool with pinging dot', () => {
    const tool: ToolRun = { id: '1', name: 'read_file', summary: 'Reading config', status: 'running' };
    const { container } = render(<ToolStatusItem tool={tool} />);

    expect(screen.getByText('read_file')).toBeInTheDocument();

    // Should have pinging animation
    const pingDot = container.querySelector('.animate-ping');
    expect(pingDot).toBeInTheDocument();
  });

  it('should render completed tool with check icon', () => {
    const tool: ToolRun = { id: '2', name: 'write_file', summary: 'Wrote output', status: 'completed' };
    const { container } = render(<ToolStatusItem tool={tool} />);

    expect(screen.getByText('write_file')).toBeInTheDocument();

    // Should have emerald check
    const checkIcon = container.querySelector('.text-emerald-500');
    expect(checkIcon).toBeInTheDocument();
  });

  it('should render failed tool with X icon', () => {
    const tool: ToolRun = { id: '3', name: 'execute', summary: 'Failed', status: 'failed' };
    const { container } = render(<ToolStatusItem tool={tool} />);

    expect(screen.getByText('execute')).toBeInTheDocument();

    // Should have red X
    const xIcon = container.querySelector('.text-red-500');
    expect(xIcon).toBeInTheDocument();
  });

  it('should display tool name in monospace font', () => {
    const tool: ToolRun = { id: '4', name: 'grep_search', summary: 'Searching', status: 'running' };
    render(<ToolStatusItem tool={tool} />);

    const toolName = screen.getByText('grep_search');
    expect(toolName).toHaveClass('font-mono');
  });
});
