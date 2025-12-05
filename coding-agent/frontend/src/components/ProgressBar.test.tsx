import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';
import type { Todo } from '../types';

describe('ProgressBar', () => {
  const mockTodos: Todo[] = [
    { id: '1', content: 'Task 1', status: 'completed', points: 3 },
    { id: '2', content: 'Task 2', status: 'in_progress', points: 5 },
    { id: '3', content: 'Task 3', status: 'pending', points: 2 },
  ];

  it('renders progress information correctly', () => {
    render(<ProgressBar todos={mockTodos} />);
    
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // completed points
    expect(screen.getByText('10')).toBeInTheDocument(); // total points
    expect(screen.getByText('points')).toBeInTheDocument();
  });

  it('calculates progress percentage correctly', () => {
    render(<ProgressBar todos={mockTodos} />);
    
    // 3/10 = 30%
    expect(screen.getByText('30% complete')).toBeInTheDocument();
  });

  it('shows task completion count', () => {
    render(<ProgressBar todos={mockTodos} />);
    
    expect(screen.getByText('1/3 tasks')).toBeInTheDocument();
  });

  it('handles todos without points (defaults to 1)', () => {
    const todosWithoutPoints: Todo[] = [
      { id: '1', content: 'Task 1', status: 'completed' },
      { id: '2', content: 'Task 2', status: 'pending' },
    ];
    
    render(<ProgressBar todos={todosWithoutPoints} />);
    
    expect(screen.getByText('1')).toBeInTheDocument(); // completed points
    expect(screen.getByText('2')).toBeInTheDocument(); // total points
  });

  it('handles empty todo list', () => {
    render(<ProgressBar todos={[]} />);
    
    expect(screen.getByText('0')).toBeInTheDocument(); // completed points
    expect(screen.getByText('0')).toBeInTheDocument(); // total points
    expect(screen.getByText('0% complete')).toBeInTheDocument();
  });
});