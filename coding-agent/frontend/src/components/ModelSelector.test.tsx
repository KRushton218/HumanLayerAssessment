import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelSelector } from './ModelSelector';

describe('ModelSelector', () => {
  it('should render select with current model selected', () => {
    render(
      <ModelSelector model="claude-sonnet-4-20250514" onModelChange={vi.fn()} />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('claude-sonnet-4-20250514');
  });

  it('should display all model options', () => {
    render(
      <ModelSelector model="claude-sonnet-4-20250514" onModelChange={vi.fn()} />
    );

    expect(screen.getByText('Claude Sonnet 4')).toBeInTheDocument();
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
    expect(screen.getByText('Claude 3 Haiku')).toBeInTheDocument();
  });

  it('should call onModelChange when selection changes', () => {
    const onModelChange = vi.fn();
    render(
      <ModelSelector model="claude-sonnet-4-20250514" onModelChange={onModelChange} />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'claude-3-haiku-20240307' } });

    expect(onModelChange).toHaveBeenCalledWith('claude-3-haiku-20240307');
  });
});
