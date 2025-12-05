import React from 'react';
import { ChevronDown, Loader2, CheckCircle2, XCircle, GitBranch } from 'lucide-react';
import type { AssistantStep } from '../../types';

interface SubtaskStepProps {
  step: AssistantStep;
  onToggleCollapse: () => void;
}

function getStatusIcon(status: string | undefined) {
  switch (status) {
    case 'running':
      return <Loader2 size={14} className="text-blue-500 animate-spin" />;
    case 'completed':
      return <CheckCircle2 size={14} className="text-emerald-500" />;
    case 'failed':
      return <XCircle size={14} className="text-red-500" />;
    default:
      return <GitBranch size={14} className="text-slate-400" />;
  }
}

export const SubtaskStep: React.FC<SubtaskStepProps> = ({ step, onToggleCollapse }) => {
  const statusColors: Record<string, string> = {
    running: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20',
    completed: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
    failed: 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20',
    pending_approval: 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20',
    stopped: 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800',
  };

  const borderColor = statusColors[step.status || 'running'];

  return (
    <div className={`my-2 border rounded-lg overflow-hidden ${borderColor}`}>
      {/* Header - always visible */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
      >
        {getStatusIcon(step.status)}
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
          Subtask
        </span>
        <span className="text-sm text-slate-600 dark:text-slate-400 truncate flex-1">
          {step.subtaskPrompt}
        </span>
        <ChevronDown
          size={14}
          className={`text-slate-400 dark:text-slate-500 transition-transform ml-auto ${
            step.isCollapsed ? '-rotate-90' : ''
          }`}
        />
      </button>

      {/* Collapsible content */}
      {!step.isCollapsed && (
        <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-700">
          <div className="mb-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Prompt:</span>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              {step.subtaskPrompt}
            </p>
          </div>
          {step.subtaskSummary && (
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Result:</span>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {step.subtaskSummary}
              </p>
            </div>
          )}
          {step.status === 'running' && !step.subtaskSummary && (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">Executing subtask...</p>
          )}
        </div>
      )}
    </div>
  );
};
