import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChatMessage,
  TaskRow,
  ToolStatusItem,
  ChatInput,
  SubtaskIndicator,
  ContextMeter,
  ModelSelector,
  CheckpointControls,
  ApiKeyInput,
  ProgressBar,
  TargetSelector,
} from './components';
import { useSSE } from './hooks/useSSE';
import * as api from './api';
import type {
  Message,
  Todo,
  ToolRun,
  SubtaskStatus,
  ContextUsage,
  Checkpoint,
} from './types';

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [tools, setTools] = useState<ToolRun[]>([]);
  const [subtask, setSubtask] = useState<SubtaskStatus | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsage>({ tokens: 0, percentage: 0, warning: false });
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [targetDirectory, setTargetDirectory] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingTextRef = useRef('');

  // Keep ref in sync with state for use in callbacks
  useEffect(() => {
    streamingTextRef.current = streamingText;
  }, [streamingText]);

  // Initialize session, check API key status, and fetch target directory
  useEffect(() => {
    api.createSession().then(setSessionId);
    api.getApiKeyStatus().then(data => setHasApiKey(data.hasApiKey));
    api.getTarget().then(data => setTargetDirectory(data.targetDirectory));
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // SSE event handlers
  const sseHandlers = {
    text: useCallback((data: unknown) => {
      const { content } = data as { content: string };
      setStreamingText(prev => prev + content);
    }, []),

    tool_start: useCallback((data: unknown) => {
      const { name, summary } = data as { name: string; summary: string };
      setTools(prev => [...prev, { id: `${Date.now()}`, name, summary, status: 'running' }]);
    }, []),

    tool_complete: useCallback((data: unknown) => {
      const { name, success } = data as { name: string; success: boolean };
      setTools(prev =>
        prev.map(t =>
          t.name === name && t.status === 'running'
            ? { ...t, status: success ? 'completed' : 'failed' }
            : t
        )
      );
    }, []),

    todo_update: useCallback((data: unknown) => {
      const { todos } = data as { todos: Todo[] };
      setTodos(todos);
    }, []),

    subtask_start: useCallback((data: unknown) => {
      const { id, prompt } = data as { id: string; prompt: string };
      setSubtask({ id, prompt, status: 'running' });
    }, []),

    subtask_complete: useCallback((data: unknown) => {
      const { id, success, summary } = data as { id: string; success: boolean; summary?: string };
      setSubtask(prev =>
        prev?.id === id
          ? { ...prev, status: success ? 'completed' : 'failed', summary }
          : prev
      );
      setTimeout(() => setSubtask(null), 3000);
    }, []),

    context_update: useCallback((data: unknown) => {
      setContextUsage(data as ContextUsage);
    }, []),

    checkpoint_created: useCallback((data: unknown) => {
      const { id } = data as { id: string };
      setCheckpoints(prev => [{ id, timestamp: Date.now() }, ...prev]);
    }, []),

    reverted: useCallback(() => {
      if (sessionId) {
        api.getTodos(sessionId).then(data => setTodos(data.todos || []));
      }
    }, [sessionId]),

    error: useCallback((data: unknown) => {
      const { error } = data as { error: string };
      console.error('Agent error:', error);
      setIsProcessing(false);
    }, []),
  };

  useSSE(sessionId, sseHandlers);

  const handleSendMessage = async (content: string) => {
    if (!sessionId) return;

    setIsProcessing(true);
    setStreamingText('');
    setMessages(prev => [...prev, { role: 'user', content }]);

    try {
      await api.sendMessage(sessionId, content, model);
      // Finalize streaming text as assistant message
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: streamingTextRef.current || '(Task completed)' },
      ]);
      setStreamingText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModelChange = async (newModel: string) => {
    setModel(newModel);
    await api.setModel(newModel);
  };

  const handleApiKeySubmit = async (apiKey: string) => {
    await api.setApiKey(apiKey);
    setHasApiKey(true);
  };

  const handleRevert = async (checkpointId: string) => {
    if (!sessionId) return;
    await api.revertToCheckpoint(sessionId, checkpointId);
  };

  const handleFork = async (checkpointId: string) => {
    if (!sessionId) return;
    const newSessionId = await api.forkFromCheckpoint(sessionId, checkpointId);
    setSessionId(newSessionId);
    setMessages([]);
    setStreamingText('');
    setTools([]);
    setCheckpoints([]);
  };

  const handleTargetChange = async (newTarget: string) => {
    const result = await api.setTarget(newTarget);
    setTargetDirectory(result.targetDirectory);
  };

  return (
    <div className="flex h-screen w-full bg-white text-slate-900">
      {/* LEFT: Main Chat Area */}
      <main className="flex flex-1 flex-col border-r border-slate-200">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-slate-100 px-6">
          <div className="flex items-center gap-4">
            <span className="font-semibold tracking-tight text-slate-900">Coding Agent</span>
            {targetDirectory && (
              <TargetSelector
                targetDirectory={targetDirectory}
                onTargetChange={handleTargetChange}
              />
            )}
          </div>
          <div className="flex items-center gap-4">
            <ApiKeyInput onSubmit={handleApiKeySubmit} isConfigured={hasApiKey} />
            <ModelSelector model={model} onModelChange={handleModelChange} />
            <ContextMeter usage={contextUsage} />
          </div>
        </header>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50">
          {messages.length === 0 && !streamingText && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              {!hasApiKey ? (
                <p className="text-sm">Enter your Anthropic API key above to get started</p>
              ) : (
                <p className="text-sm">Start a conversation with the coding agent</p>
              )}
            </div>
          )}
          {messages.map((msg, idx) => (
            <ChatMessage key={idx} role={msg.role} content={msg.content} />
          ))}
          {streamingText && (
            <ChatMessage role="assistant" content={streamingText} isStreaming />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Subtask Indicator */}
        <SubtaskIndicator subtask={subtask} />

        {/* Input */}
        <ChatInput onSend={handleSendMessage} disabled={isProcessing || !hasApiKey} />
      </main>

      {/* RIGHT: Sidebar */}
      <aside className="w-80 flex flex-col bg-slate-50 overflow-hidden shrink-0">
        {/* Section: Todo List */}
        <div className="flex-1 overflow-y-auto p-4 border-b border-slate-200">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Plan</h3>
          
          {todos.length > 0 && <ProgressBar todos={todos} />}
          
          {todos.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No tasks yet</p>
          ) : (
            <div className="space-y-1">
              {todos.map(task => <TaskRow key={task.id} task={task} />)}
            </div>
          )}
        </div>

        {/* Section: Tool Activity */}
        <div className="h-1/3 p-4 bg-white border-b border-slate-200 overflow-hidden">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Activity</h3>
          {tools.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No tool activity</p>
          ) : (
            <div className="flex flex-col max-h-32 overflow-y-auto overflow-x-hidden">
              {tools.slice(-5).map(tool => (
                <ToolStatusItem key={tool.id} tool={tool} />
              ))}
            </div>
          )}
        </div>

        {/* Section: Checkpoints */}
        <CheckpointControls
          checkpoints={checkpoints}
          onRevert={handleRevert}
          onFork={handleFork}
        />
      </aside>
    </div>
  );
}

export default App;
