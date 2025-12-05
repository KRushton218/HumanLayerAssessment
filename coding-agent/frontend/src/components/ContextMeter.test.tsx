import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextMeter } from './ContextMeter';

describe('ContextMeter', () => {
  it('should display percentage value', () => {
    render(<ContextMeter usage={{ tokens: 1000, percentage: 25, warning: false }} />);

    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('should show green bar when percentage is low', () => {
    const { container } = render(
      <ContextMeter usage={{ tokens: 500, percentage: 10, warning: false }} />
    );

    const bar = container.querySelector('.bg-emerald-500');
    expect(bar).toBeInTheDocument();
  });

  it('should show amber bar when percentage is at warning level', () => {
    const { container } = render(
      <ContextMeter usage={{ tokens: 6400, percentage: 35, warning: true }} />
    );

    const bar = container.querySelector('.bg-amber-500');
    expect(bar).toBeInTheDocument();
  });

  it('should show red bar when percentage is high', () => {
    const { container } = render(
      <ContextMeter usage={{ tokens: 10000, percentage: 50, warning: true }} />
    );

    const bar = container.querySelector('.bg-red-500');
    expect(bar).toBeInTheDocument();
  });

  it('should apply warning text color when warning is true', () => {
    render(<ContextMeter usage={{ tokens: 6400, percentage: 32, warning: true }} />);

    const percentText = screen.getByText('32%');
    expect(percentText).toHaveClass('text-amber-500');
  });

  it('should cap bar width at 100%', () => {
    const { container } = render(
      <ContextMeter usage={{ tokens: 25000, percentage: 125, warning: true }} />
    );

    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '100%' });
  });
});
