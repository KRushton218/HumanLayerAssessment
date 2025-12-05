import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TargetSelector } from './TargetSelector';

// Mock the API
vi.mock('../api', () => ({
  completeTarget: vi.fn(),
}));

import { completeTarget } from '../api';

describe('TargetSelector', () => {
  const defaultProps = {
    targetDirectory: '/home/user/project',
    onTargetChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (completeTarget as ReturnType<typeof vi.fn>).mockResolvedValue({
      suggestions: [],
      parentDir: null,
    });
  });

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

  it('cancels editing when Escape is pressed', () => {
    render(<TargetSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    // Should be in edit mode
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    // Should be back to display mode
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('project')).toBeInTheDocument();
  });

  it('calls onTargetChange when Enter is pressed', async () => {
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

    // Press Enter
    fireEvent.keyDown(input, { key: 'Enter' });

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

    // Press Enter to submit
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Directory not found')).toBeInTheDocument();
    });
  });

  it('fetches suggestions when typing', async () => {
    (completeTarget as ReturnType<typeof vi.fn>).mockResolvedValue({
      suggestions: ['/home/user/project1', '/home/user/project2'],
      parentDir: '/home/user',
    });

    render(<TargetSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '/home/user/pro' } });

    await waitFor(() => {
      expect(completeTarget).toHaveBeenCalledWith('/home/user/pro');
    });
  });

  it('shows autocomplete suggestions dropdown', async () => {
    (completeTarget as ReturnType<typeof vi.fn>).mockResolvedValue({
      suggestions: ['/home/user/project1', '/home/user/project2'],
      parentDir: '/home/user',
    });

    render(<TargetSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '/home/user/' } });

    await waitFor(() => {
      expect(screen.getByText('project1')).toBeInTheDocument();
      expect(screen.getByText('project2')).toBeInTheDocument();
    });
  });

  it('navigates suggestions with arrow keys', async () => {
    (completeTarget as ReturnType<typeof vi.fn>).mockResolvedValue({
      suggestions: ['/home/user/project1', '/home/user/project2'],
      parentDir: '/home/user',
    });

    render(<TargetSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '/home/user/' } });

    await waitFor(() => {
      expect(screen.getByText('project1')).toBeInTheDocument();
    });

    // Press down arrow to select first suggestion
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // First suggestion should be highlighted (has bg-blue-50 class)
    const firstSuggestion = screen.getByText('project1').closest('button');
    expect(firstSuggestion).toHaveClass('bg-blue-50');
  });

  it('completes suggestion with Tab when only one suggestion', async () => {
    (completeTarget as ReturnType<typeof vi.fn>).mockResolvedValue({
      suggestions: ['/home/user/project'],
      parentDir: '/home/user',
    });

    render(<TargetSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '/home/user/pro' } });

    await waitFor(() => {
      expect(completeTarget).toHaveBeenCalled();
    });

    // Press Tab to complete
    fireEvent.keyDown(input, { key: 'Tab' });

    await waitFor(() => {
      expect(input).toHaveValue('/home/user/project/');
    });
  });

  it('shows help text in dropdown', async () => {
    (completeTarget as ReturnType<typeof vi.fn>).mockResolvedValue({
      suggestions: ['/home/user/project1'],
      parentDir: '/home/user',
    });

    render(<TargetSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '/home/user/' } });

    await waitFor(() => {
      expect(screen.getByText(/Tab to complete/)).toBeInTheDocument();
    });
  });
});
