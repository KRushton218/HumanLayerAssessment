import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from './ChatInput';

describe('ChatInput', () => {
  it('should render input field and send button', () => {
    render(<ChatInput onSend={vi.fn()} />);

    expect(screen.getByPlaceholderText(/describe a task/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should call onSend with input value when submitted', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const input = screen.getByPlaceholderText(/describe a task/i);
    fireEvent.change(input, { target: { value: 'Hello agent' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).toHaveBeenCalledWith('Hello agent');
  });

  it('should clear input after sending', () => {
    render(<ChatInput onSend={vi.fn()} />);

    const input = screen.getByPlaceholderText(/describe a task/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.submit(input.closest('form')!);

    expect(input.value).toBe('');
  });

  it('should not send empty message', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const input = screen.getByPlaceholderText(/describe a task/i);
    fireEvent.submit(input.closest('form')!);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should not send whitespace-only message', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const input = screen.getByPlaceholderText(/describe a task/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled />);

    const input = screen.getByPlaceholderText(/agent is working/i);
    expect(input).toBeDisabled();
  });

  it('should not call onSend when disabled', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled />);

    const input = screen.getByPlaceholderText(/agent is working/i);
    fireEvent.change(input, { target: { value: 'Test' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should show different placeholder when disabled', () => {
    render(<ChatInput onSend={vi.fn()} disabled />);

    expect(screen.getByPlaceholderText(/agent is working/i)).toBeInTheDocument();
  });

  it('should enable send button only when input has content', () => {
    render(<ChatInput onSend={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();

    const input = screen.getByPlaceholderText(/describe a task/i);
    fireEvent.change(input, { target: { value: 'Test' } });

    expect(button).not.toBeDisabled();
  });
});
