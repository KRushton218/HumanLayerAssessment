import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TargetSelector } from './TargetSelector';

describe('TargetSelector', () => {
  const defaultProps = {
    targetDirectory: '/home/user/project',
    onTargetChange: vi.fn(),
  };

  it('renders the target directory name', () => {
    render(<TargetSelector {...defaultProps} />);
    expect(screen.getByText('project')).toBeInTheDocument();
  });

  it('shows full path on hover via title attribute', () => {
    render(<TargetSelector {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', '/home/user/project');
  });

  it('enters edit mode when clicked', () => {
    render(<TargetSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows current path in input when editing', () => {
    render(<TargetSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toHaveValue('/home/user/project');
  });

  it('cancels editing when cancel button is clicked', () => {
    render(<TargetSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    // Should be in edit mode
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Click cancel
    fireEvent.click(screen.getByTitle('Cancel'));

    // Should be back to display mode
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('project')).toBeInTheDocument();
  });

  it('calls onTargetChange when form is submitted', async () => {
    const mockOnTargetChange = vi.fn().mockResolvedValue(undefined);
    render(
      <TargetSelector
        targetDirectory="/home/user/project"
        onTargetChange={mockOnTargetChange}
      />
    );

    // Enter edit mode
    fireEvent.click(screen.getByRole('button'));

    // Change input value
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '/home/user/other-project' } });

    // Submit form
    fireEvent.click(screen.getByTitle('Set target'));

    await waitFor(() => {
      expect(mockOnTargetChange).toHaveBeenCalledWith('/home/user/other-project');
    });
  });

  it('shows error message when onTargetChange fails', async () => {
    const mockOnTargetChange = vi.fn().mockRejectedValue(new Error('Directory not found'));
    render(
      <TargetSelector
        targetDirectory="/home/user/project"
        onTargetChange={mockOnTargetChange}
      />
    );

    // Enter edit mode
    fireEvent.click(screen.getByRole('button'));

    // Submit form
    fireEvent.click(screen.getByTitle('Set target'));

    await waitFor(() => {
      expect(screen.getByText('Directory not found')).toBeInTheDocument();
    });
  });

  it('resets input value when canceling after an error', async () => {
    const mockOnTargetChange = vi.fn().mockRejectedValue(new Error('Invalid path'));
    render(
      <TargetSelector
        targetDirectory="/home/user/project"
        onTargetChange={mockOnTargetChange}
      />
    );

    // Enter edit mode and change value
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '/invalid/path' } });

    // Submit and wait for error
    fireEvent.click(screen.getByTitle('Set target'));
    await waitFor(() => {
      expect(screen.getByText('Invalid path')).toBeInTheDocument();
    });

    // Cancel
    fireEvent.click(screen.getByTitle('Cancel'));

    // Re-enter edit mode - should show original path
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toHaveValue('/home/user/project');
  });
});
