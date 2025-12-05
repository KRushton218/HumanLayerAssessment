import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskRow } from './TaskRow';
import type { Todo } from '../types';

describe('TaskRow', () => {
  it('should render pending task with circle icon', () => {
    const task: Todo = { id: '1', content: 'Pending task', status: 'pending' };
    render(<TaskRow task={task} />);

    expect(screen.getByText('Pending task')).toBeInTheDocument();
    expect(screen.getByText('Pending task')).toHaveClass('text-slate-500');
  });

  it('should render in_progress task with spinning loader', () => {
    const task: Todo = { id: '2', content: 'In progress task', status: 'in_progress' };
    const { container } = render(<TaskRow task={task} />);

    expect(screen.getByText('In progress task')).toBeInTheDocument();
    expect(screen.getByText('In progress task')).toHaveClass('text-slate-900', 'font-medium');

    // Should have amber highlight
    const row = container.firstChild;
    expect(row).toHaveClass('bg-amber-50/50');

    // Should have spinning icon
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render completed task with check icon and strikethrough', () => {
    const task: Todo = { id: '3', content: 'Completed task', status: 'completed' };
    const { container } = render(<TaskRow task={task} />);

    expect(screen.getByText('Completed task')).toBeInTheDocument();
    expect(screen.getByText('Completed task')).toHaveClass('line-through', 'text-slate-400');

    // Should have emerald check icon
    const checkIcon = container.querySelector('.text-emerald-500');
    expect(checkIcon).toBeInTheDocument();
  });

  it('should display task content correctly', () => {
    const task: Todo = { id: '4', content: 'Implement feature X', status: 'pending' };
    render(<TaskRow task={task} />);

    expect(screen.getByText('Implement feature X')).toBeInTheDocument();
  });
});
