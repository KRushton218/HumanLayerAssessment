import React from 'react';
import {
  ChevronDown,
  FileText,
  FilePlus,
  FileEdit,
  Terminal,
  FolderOpen,
  Wrench,
  Check,
  X,
  Loader2,
  Shield,
} from 'lucide-react';
import type { AssistantStep } from '../../types';

interface ToolStepProps {
  step: AssistantStep;
  onToggleCollapse: () => void;
  onFileClick?: (path: string) => void;
}

function getToolIcon(toolName: string | undefined) {
  switch (toolName) {
    case 'read_file':
      return <FileText size={14} />;
    case 'write_file':
      return <FilePlus size={14} />;
    case 'edit_file':
      return <FileEdit size={14} />;
    case 'execute_shell':
    case 'bash':
      return <Terminal size={14} />;
    case 'list_directory':
      return <FolderOpen size={14} />;
    default:
      return <Wrench size={14} />;
  }
}

function getStatusIcon(status: string | undefined) {
  switch (status) {
    case 'running':
      return <Loader2 size={14} className="text-amber-500 animate-spin" />;
    case 'pending_approval':
      return <Shield size={14} className="text-purple-500 animate-pulse" />;
    case 'completed':
      return <Check size={14} className="text-emerald-500" />;
    case 'failed':
      return <X size={14} className="text-red-500" />;
    case 'stopped':
      return <X size={14} className="text-slate-500" />;
    default:
      return null;
  }
}

export const ToolStep: React.FC<ToolStepProps> = ({ step, onToggleCollapse, onFileClick }) => {
  const statusColors: Record<string, string> = {
    running: 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20',
    pending_approval: 'border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20',
    completed: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
    failed: 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20',
    stopped: 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800',
  };

  const borderColor = statusColors[step.status || 'running'];

  return (
    <div className={`my-2 border rounded-lg overflow-hidden ${borderColor}`}>
      {/* Header - always visible */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left min-w-0"
      >
        <span className="flex-shrink-0">{getStatusIcon(step.status)}</span>
        <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">
          {getToolIcon(step.toolName)}
        </span>
        <span className="font-mono text-sm text-slate-700 dark:text-slate-300 font-medium flex-shrink-0">
          {step.toolName}
        </span>
        {step.filePath && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFileClick?.(step.filePath!);
            }}
            className="text-amber-700 dark:text-amber-400 text-sm font-mono hover:underline truncate min-w-0 flex-1"
            title={step.filePath}
          >
            {step.filePath}
          </button>
        )}
        {step.toolSummary && !step.filePath && (
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate min-w-0 flex-1" title={step.toolSummary}>
            {step.toolSummary}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-slate-400 dark:text-slate-500 transition-transform flex-shrink-0 ${
            step.isCollapsed ? '-rotate-90' : ''
          }`}
        />
      </button>

      {/* Collapsible content */}
      {!step.isCollapsed && (
        <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-700 overflow-hidden">
          {/* Always show input when available */}
          {step.toolInput && Object.keys(step.toolInput).length > 0 && (
            <div className="mb-2 min-w-0">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Input:</span>
              <pre className="mt-1 text-xs bg-slate-900 text-slate-100 p-2 rounded overflow-x-auto max-w-full">
                {JSON.stringify(step.toolInput, null, 2)}
              </pre>
            </div>
          )}
          {/* Show running indicator when status is running */}
          {step.status === 'running' && (
            <p className="text-xs text-amber-600 dark:text-amber-400 italic mb-2">Running...</p>
          )}
          {/* Show pending approval indicator */}
          {step.status === 'pending_approval' && (
            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-2">Awaiting approval...</p>
          )}
          {/* Show output when available */}
          {step.toolOutput && (
            <div className="min-w-0">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Output:</span>
              <pre className="mt-1 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap break-words max-w-full">
                {step.toolOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
