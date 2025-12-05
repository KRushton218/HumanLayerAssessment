import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CheckpointControls } from './CheckpointControls';
import type { Checkpoint } from '../types';

describe('CheckpointControls', () => {
  const mockCheckpoints: Checkpoint[] = [
    { id: 'cp-1', timestamp: Date.now() - 60000 },
    { id: 'cp-2', timestamp: Date.now() - 120000 },
  ];

  it('should not render when checkpoints array is empty', () => {
    const { container } = render(
      <CheckpointControls checkpoints={[]} onRevert={vi.fn()} onFork={vi.fn()} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render checkpoints with timestamps', () => {
    render(
      <CheckpointControls
        checkpoints={mockCheckpoints}
        onRevert={vi.fn()}
        onFork={vi.fn()}
      />
    );

    expect(screen.getByText('Checkpoints')).toBeInTheDocument();
    // Should show 2 checkpoint entries
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(4); // 2 revert + 2 fork buttons
  });

  it('should call onRevert with checkpoint id when revert clicked', () => {
    const onRevert = vi.fn();
    render(
      <CheckpointControls
        checkpoints={mockCheckpoints}
        onRevert={onRevert}
        onFork={vi.fn()}
      />
    );

    const revertButtons = screen.getAllByTitle('Revert to checkpoint');
    fireEvent.click(revertButtons[0]);

    expect(onRevert).toHaveBeenCalledWith('cp-1');
  });

  it('should call onFork with checkpoint id when fork clicked', () => {
    const onFork = vi.fn();
    render(
      <CheckpointControls
        checkpoints={mockCheckpoints}
        onRevert={vi.fn()}
        onFork={onFork}
      />
    );

    const forkButtons = screen.getAllByTitle('Fork from checkpoint');
    fireEvent.click(forkButtons[1]);

    expect(onFork).toHaveBeenCalledWith('cp-2');
  });

  it('should only show first 5 checkpoints', () => {
    const manyCheckpoints: Checkpoint[] = Array.from({ length: 10 }, (_, i) => ({
      id: `cp-${i}`,
      timestamp: Date.now() - i * 60000,
    }));

    render(
      <CheckpointControls
        checkpoints={manyCheckpoints}
        onRevert={vi.fn()}
        onFork={vi.fn()}
      />
    );

    // Should have 10 buttons (5 revert + 5 fork), not 20
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(10);
  });
});
