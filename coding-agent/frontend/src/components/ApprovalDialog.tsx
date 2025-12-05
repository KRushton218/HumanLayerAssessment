import React, { useState } from 'react';
import { AlertTriangle, Terminal, FileEdit, FilePlus, Shield, ShieldCheck, ShieldX } from 'lucide-react';
import type { ApprovalRequest, ApprovalDecision } from '../types';

interface ApprovalDialogProps {
  request: ApprovalRequest;
  onRespond: (decision: ApprovalDecision, pattern?: string) => void;
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'execute_shell':
      return <Terminal size={20} />;
    case 'write_file':
      return <FilePlus size={20} />;
    case 'edit_file':
      return <FileEdit size={20} />;
    default:
      return <Shield size={20} />;
  }
}

function getToolDisplayName(toolName: string): string {
  switch (toolName) {
    case 'execute_shell':
      return 'Shell Command';
    case 'write_file':
      return 'Write File';
    case 'edit_file':
      return 'Edit File';
    default:
      return toolName;
  }
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({ request, onRespond }) => {
  const [customPattern, setCustomPattern] = useState(request.suggestedPattern || '');

  // Get the primary content to show (command or path)
  const primaryContent = request.toolName === 'execute_shell'
    ? request.toolInput.command as string
    : request.toolInput.path as string;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[500px] max-w-[90vw] overflow-hidden">
        {/* Header */}
        <div className={`flex items-center gap-3 px-4 py-3 ${
          request.isDangerous
            ? 'bg-red-500 text-white'
            : 'bg-amber-500 text-white'
        }`}>
          {request.isDangerous ? (
            <AlertTriangle size={20} />
          ) : (
            getToolIcon(request.toolName)
          )}
          <div>
            <h3 className="font-semibold">
              {request.isDangerous ? 'Dangerous Operation' : 'Approval Required'}
            </h3>
            <p className="text-sm opacity-90">
              {getToolDisplayName(request.toolName)}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          {/* Command/Path display */}
          <div className="mb-4">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {request.toolName === 'execute_shell' ? 'Command' : 'File'}
            </label>
            <pre className="mt-1 p-3 bg-slate-900 text-slate-100 rounded text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {primaryContent}
            </pre>
          </div>

          {/* Dangerous warning */}
          {request.isDangerous && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle size={16} />
                <span className="text-sm font-medium">
                  This command matches a dangerous pattern and cannot be auto-approved.
                </span>
              </div>
            </div>
          )}

          {/* Pattern input for "Allow pattern" */}
          {!request.isDangerous && request.suggestedPattern && (
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Trust Pattern (for "Allow for session")
              </label>
              <input
                type="text"
                value={customPattern}
                onChange={(e) => setCustomPattern(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-mono text-sm"
                placeholder="e.g., npm * or /path/to/dir/*"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Use * as wildcard. Future matching commands will be auto-approved.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
          {/* Deny */}
          <button
            onClick={() => onRespond('deny')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded font-medium text-sm transition-colors"
          >
            <ShieldX size={16} />
            Deny
          </button>

          <div className="flex-1" />

          {/* Allow Once */}
          <button
            onClick={() => onRespond('allow_once')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-medium text-sm transition-colors"
          >
            <ShieldCheck size={16} />
            Allow Once
          </button>

          {/* Allow Pattern (only if not dangerous and pattern exists) */}
          {!request.isDangerous && customPattern && (
            <button
              onClick={() => onRespond('allow_pattern', customPattern)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-medium text-sm transition-colors"
            >
              <Shield size={16} />
              Allow Pattern
            </button>
          )}

          {/* Allow Tool (only if not dangerous) */}
          {!request.isDangerous && (
            <button
              onClick={() => onRespond('allow_tool')}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded font-medium text-sm transition-colors"
            >
              <Shield size={16} />
              Trust {getToolDisplayName(request.toolName)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
