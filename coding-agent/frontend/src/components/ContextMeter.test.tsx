import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMeter } from './ContextMeter';
import type { ContextUsage } from '../types';

// Helper to create a valid ContextUsage object
function createUsage(overrides: Partial<ContextUsage> = {}): ContextUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    percentage: 0,
    warning: false,
    atSoftLimit: false,
    maxTokens: 200000,
    ...overrides,
  };
}

describe('ContextMeter', () => {
  it('should display percentage value', () => {
    render(<ContextMeter usage={createUsage({ totalTokens: 1000, percentage: 25 })} />);

    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });

  it('should show green bar when percentage is low', () => {
    const { container } = render(
      <ContextMeter usage={createUsage({ totalTokens: 500, percentage: 10 })} />
    );

    const bar = container.querySelector('.bg-emerald-500');
    expect(bar).toBeInTheDocument();
  });

  it('should show amber bar when percentage is at warning level', () => {
    const { container } = render(
      <ContextMeter usage={createUsage({ totalTokens: 6400, percentage: 35, warning: true })} />
    );

    const bar = container.querySelector('.bg-amber-500');
    expect(bar).toBeInTheDocument();
  });

  it('should show red bar when percentage is high (at soft limit)', () => {
    const { container } = render(
      <ContextMeter usage={createUsage({ totalTokens: 10000, percentage: 50, warning: true, atSoftLimit: true })} />
    );

    const bar = container.querySelector('.bg-red-500');
    expect(bar).toBeInTheDocument();
  });

  it('should apply warning text color when warning is true', () => {
    render(<ContextMeter usage={createUsage({ totalTokens: 6400, percentage: 32, warning: true })} />);

    const percentText = screen.getByText('32.0%');
    expect(percentText).toHaveClass('text-amber-500');
  });

  it('should cap bar width at 100%', () => {
    const { container } = render(
      <ContextMeter usage={createUsage({ totalTokens: 25000, percentage: 125, warning: true, atSoftLimit: true })} />
    );

    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '100%' });
  });

  it('should show tooltip on hover with detailed breakdown', () => {
    const { container } = render(
      <ContextMeter usage={createUsage({
        inputTokens: 5000,
        outputTokens: 2000,
        totalTokens: 7000,
        percentage: 3.5,
        maxTokens: 200000,
      })} />
    );

    // Hover over the component
    const meter = container.querySelector('.relative');
    fireEvent.mouseEnter(meter!);

    // Check that tooltip shows input/output breakdown
    expect(screen.getByText('Input:')).toBeInTheDocument();
    expect(screen.getByText('Output:')).toBeInTheDocument();
    expect(screen.getByText('5.0k')).toBeInTheDocument();
    expect(screen.getByText('2.0k')).toBeInTheDocument();
  });

  it('should format large token counts correctly', () => {
    const { container } = render(
      <ContextMeter usage={createUsage({
        inputTokens: 150000,
        outputTokens: 50000,
        totalTokens: 200000,
        percentage: 100,
        maxTokens: 200000,
        atSoftLimit: true,
      })} />
    );

    // Hover to show tooltip
    const meter = container.querySelector('.relative');
    fireEvent.mouseEnter(meter!);

    // Should show "150.0k" and "50.0k" formatted
    expect(screen.getByText('150.0k')).toBeInTheDocument();
    expect(screen.getByText('50.0k')).toBeInTheDocument();
  });
});
