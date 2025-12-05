import { useEffect, useRef } from 'react';

type EventHandler = (data: unknown) => void;

export function useSSE(sessionId: string | null, handlers: Record<string, EventHandler>) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(`http://localhost:3001/api/events/${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('SSE connected');
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };

    const eventTypes = [
      'connected', 'text', 'tool_start', 'tool_complete',
      'todo_update', 'subtask_start', 'subtask_complete',
      'context_update', 'checkpoint_created', 'checkpoint_updated', 'reverted', 'error',
      'approval_required', 'approval_result',
      'process_started', 'process_killed', 'process_exit'
    ];

    eventTypes.forEach(eventType => {
      eventSource.addEventListener(eventType, (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        handlersRef.current[eventType]?.(data);
      });
    });

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  return eventSourceRef.current;
}
