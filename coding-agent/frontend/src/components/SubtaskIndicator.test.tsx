import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubtaskIndicator } from './SubtaskIndicator';

describe('SubtaskIndicator', () => {
  it('should not render when subtask is null', () => {
    const { container } = render(<SubtaskIndicator subtask={null} />);

    expect(container.firstChild).toBeNull();
  });

  it('should show running status with spinner', () => {
    const subtask = {
      id: 'st-1',
      prompt: 'Analyze code structure',
      status: 'running' as const,
    };
    const { container } = render(<SubtaskIndicator subtask={subtask} />);

    expect(screen.getByText('Subtask Running')).toBeInTheDocument();
    expect(screen.getByText('Analyze code structure')).toBeInTheDocument();

    // Should have spinning loader
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should show completed status with check', () => {
    const subtask = {
      id: 'st-2',
      prompt: 'Generate tests',
      status: 'completed' as const,
      summary: 'Generated 5 test files',
    };
    const { container } = render(<SubtaskIndicator subtask={subtask} />);

    expect(screen.getByText('Subtask Complete')).toBeInTheDocument();
    expect(screen.getByText('Generated 5 test files')).toBeInTheDocument();

    // Should have emerald check
    const checkIcon = container.querySelector('.text-emerald-500');
    expect(checkIcon).toBeInTheDocument();
  });

  it('should show failed status with X', () => {
    const subtask = {
      id: 'st-3',
      prompt: 'Deploy to production',
      status: 'failed' as const,
    };
    const { container } = render(<SubtaskIndicator subtask={subtask} />);

    expect(screen.getByText('Subtask Failed')).toBeInTheDocument();

    // Should have red X
    const xIcon = container.querySelector('.text-red-500');
    expect(xIcon).toBeInTheDocument();
  });

  it('should display summary when provided', () => {
    const subtask = {
      id: 'st-4',
      prompt: 'Refactor module',
      status: 'completed' as const,
      summary: 'Refactored 3 files successfully',
    };
    render(<SubtaskIndicator subtask={subtask} />);

    expect(screen.getByText('Refactored 3 files successfully')).toBeInTheDocument();
  });
});
