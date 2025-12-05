import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChatMessage,
  AssistantMessage,
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
  ThemeToggle,
  FilePreviewModal,
  ApprovalDialog,
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
  AssistantStep,
  ApprovalRequest,
  ApprovalDecision,
} from './types';

// Helper to extract file path from tool summary
function extractFilePath(summary: string): string | undefined {
  const match = summary.match(/(\/[\w./-]+\.[\w]+|~\/[\w./-]+\.[\w]+)/);
  return match?.[1];
}

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSteps, setCurrentSteps] = useState<AssistantStep[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [tools, setTools] = useState<ToolRun[]>([]);
  const [subtask, setSubtask] = useState<SubtaskStatus | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsage>({ tokens: 0, percentage: 0, warning: false });
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [targetDirectory, setTargetDirectory] = useState('');
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentStepsRef = useRef<AssistantStep[]>([]);
  const activeToolStepRef = useRef<string | null>(null);

  // Keep ref in sync with state for use in callbacks
  useEffect(() => {
    currentStepsRef.current = currentSteps;
  }, [currentSteps]);

  // Initialize session, check API key status, and fetch target directory
  useEffect(() => {
    api.createSession().then(setSessionId);
    api.getApiKeyStatus().then(data => setHasApiKey(data.hasApiKey));
    api.getTarget().then(data => setTargetDirectory(data.targetDirectory));
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentSteps]);

  // SSE event handlers with step-based architecture
  const sseHandlers = {
    text: useCallback((data: unknown) => {
      const { content } = data as { content: string };
      setCurrentSteps(prev => {
        const lastStep = prev[prev.length - 1];
        if (lastStep?.type === 'text' && lastStep.isStreaming) {
          // Append to existing text step
          return prev.map((s, i) =>
            i === prev.length - 1
              ? { ...s, content: (s.content || '') + content }
              : s
          );
        } else {
          // Create new text step
          return [...prev, {
            id: `text-${Date.now()}`,
            type: 'text' as const,
            timestamp: Date.now(),
            isCollapsed: false,
            content: content,
            isStreaming: true,
          }];
        }
      });
    }, []),

    tool_start: useCallback((data: unknown) => {
      const { name, summary, input } = data as { name: string; summary: string; input?: unknown };
      // Finalize any streaming text step
      setCurrentSteps(prev => {
        const finalized = prev.map(s =>
          s.type === 'text' && s.isStreaming ? { ...s, isStreaming: false } : s
        );
        const toolStep: AssistantStep = {
          id: `tool-${Date.now()}`,
          type: 'tool',
          timestamp: Date.now(),
          isCollapsed: false,
          toolName: name,
          toolInput: input as Record<string, unknown>,
          toolSummary: summary,
          status: 'running',
          filePath: extractFilePath(summary),
        };
        activeToolStepRef.current = toolStep.id;
        return [...finalized, toolStep];
      });
      // Also update sidebar tools
      setTools(prev => [...prev, { id: `${Date.now()}`, name, summary, status: 'running' }]);
    }, []),

    tool_complete: useCallback((data: unknown) => {
      const { name, success, output } = data as { name: string; success: boolean; output?: string };
      // Capture the ref value synchronously before clearing to avoid race condition
      // (the state update function runs asynchronously when React processes the batch)
      const stepIdToComplete = activeToolStepRef.current;
      activeToolStepRef.current = null;

      if (stepIdToComplete) {
        setCurrentSteps(prev => prev.map(s =>
          s.id === stepIdToComplete
            ? {
                ...s,
                status: success ? 'completed' : 'failed',
                toolOutput: output,
              }
            : s
        ));
      }
      // Also update sidebar tools
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
      // Also add as a step
      setCurrentSteps(prev => {
        const finalized = prev.map(s =>
          s.type === 'text' && s.isStreaming ? { ...s, isStreaming: false } : s
        );
        return [...finalized, {
          id: `subtask-${id}`,
          type: 'subtask' as const,
          timestamp: Date.now(),
          isCollapsed: false,
          subtaskPrompt: prompt,
          status: 'running',
        }];
      });
    }, []),

    subtask_complete: useCallback((data: unknown) => {
      const { id, success, summary } = data as { id: string; success: boolean; summary?: string };
      setSubtask(prev =>
        prev?.id === id
          ? { ...prev, status: success ? 'completed' : 'failed', summary }
          : prev
      );
      // Update the step
      setCurrentSteps(prev => prev.map(s =>
        s.id === `subtask-${id}`
          ? { ...s, status: success ? 'completed' : 'failed', subtaskSummary: summary }
          : s
      ));
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

    approval_required: useCallback((data: unknown) => {
      const request = data as ApprovalRequest;
      setPendingApproval(request);
      // Update the current tool step to show pending_approval status
      setCurrentSteps(prev => prev.map(s =>
        s.type === 'tool' && s.status === 'running'
          ? { ...s, status: 'pending_approval' }
          : s
      ));
    }, []),

    approval_result: useCallback((data: unknown) => {
      const { requestId, approved } = data as { requestId: string; approved: boolean };
      // Clear pending approval if it matches
      setPendingApproval(prev =>
        prev?.requestId === requestId ? null : prev
      );
      // Update tool step status back to running if approved, or to failed if denied
      if (approved) {
        setCurrentSteps(prev => prev.map(s =>
          s.type === 'tool' && s.status === 'pending_approval'
            ? { ...s, status: 'running' }
            : s
        ));
      }
    }, []),
  };

  useSSE(sessionId, sseHandlers);

  const handleSendMessage = async (content: string) => {
    if (!sessionId) return;

    setIsProcessing(true);
    setCurrentSteps([]);
    setMessages(prev => [...prev, { role: 'user', content }]);

    try {
      await api.sendMessage(sessionId, content, model);
      // Finalize streaming steps - get all text content
      const textContent = currentStepsRef.current
        .filter(s => s.type === 'text')
        .map(s => s.content || '')
        .join('\n\n');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: textContent || '(Task completed)' },
      ]);
      setCurrentSteps([]);
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleStepCollapse = (stepId: string) => {
    setCurrentSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, isCollapsed: !s.isCollapsed } : s
    ));
  };

  const handleFileClick = (path: string) => {
    setPreviewFile(path);
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
    setCurrentSteps([]);
    setTools([]);
    setCheckpoints([]);
  };

  const handleTargetChange = async (newTarget: string) => {
    const result = await api.setTarget(newTarget);
    setTargetDirectory(result.targetDirectory);
  };

  const handleApprovalResponse = async (
    decision: ApprovalDecision,
    pattern?: string
  ) => {
    if (!pendingApproval) return;
    try {
      await api.sendApprovalResponse(pendingApproval.requestId, decision, pattern);
    } catch (err) {
      console.error('Failed to send approval response:', err);
    }
    setPendingApproval(null);
  };

  return (
    <div className="flex h-screen w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* LEFT: Main Chat Area */}
      <main className="flex flex-1 flex-col border-r border-slate-200 dark:border-slate-700">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6">
          <div className="flex items-center gap-4">
            <span className="font-semibold tracking-tight text-slate-900 dark:text-slate-100">Coding Agent</span>
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
            <ThemeToggle />
          </div>
        </header>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-white dark:bg-slate-900">
          {messages.length === 0 && currentSteps.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
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
          {currentSteps.length > 0 && (
            <AssistantMessage
              steps={currentSteps}
              isStreaming={isProcessing}
              onToggleStepCollapse={handleToggleStepCollapse}
              onFileClick={handleFileClick}
            />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Subtask Indicator */}
        <SubtaskIndicator subtask={subtask} />

        {/* Input */}
        <ChatInput onSend={handleSendMessage} disabled={isProcessing || !hasApiKey} />
      </main>

      {/* RIGHT: Sidebar */}
      <aside className="w-80 flex flex-col bg-slate-50 dark:bg-slate-800 overflow-hidden shrink-0">
        {/* Section: Todo List */}
        <div className="flex-1 overflow-y-auto p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Plan</h3>

          {todos.length > 0 && <ProgressBar todos={todos} />}

          {todos.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">No tasks yet</p>
          ) : (
            <div className="space-y-2">
              {/* Only render top-level tasks (no parentId) */}
              {todos
                .filter(task => !task.parentId)
                .map(task => <TaskRow key={task.id} task={task} allTodos={todos} />)}
            </div>
          )}
        </div>

        {/* Section: Tool Activity */}
        <div className="h-1/3 p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 overflow-hidden">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Activity</h3>
          {tools.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">No tool activity</p>
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

      {/* File Preview Modal */}
      <FilePreviewModal
        filePath={previewFile}
        onClose={() => setPreviewFile(null)}
      />

      {/* Approval Dialog */}
      {pendingApproval && (
        <ApprovalDialog
          request={pendingApproval}
          onRespond={handleApprovalResponse}
        />
      )}
    </div>
  );
}

export default App;
