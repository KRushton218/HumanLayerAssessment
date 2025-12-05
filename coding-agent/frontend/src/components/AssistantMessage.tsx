import React, { useState } from 'react';
import { Terminal, Copy, Check } from 'lucide-react';
import { TextStep, ToolStep, SubtaskStep } from './steps';
import type { AssistantStep } from '../types';

interface AssistantMessageProps {
  steps: AssistantStep[];
  isStreaming: boolean;
  onToggleStepCollapse: (stepId: string) => void;
  onFileClick?: (path: string) => void;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({
  steps,
  isStreaming,
  onToggleStepCollapse,
  onFileClick,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textContent = steps
      .filter(s => s.type === 'text')
      .map(s => s.content)
      .join('\n\n');
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group mb-6 min-w-0 max-w-full">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex-shrink-0">
          <Terminal size={12} />
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Agent</span>
        {isStreaming && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Working...
          </span>
        )}
      </div>

      <div className="pl-8 pr-4 min-w-0 overflow-hidden">
        {steps.map((step) => {
          switch (step.type) {
            case 'text':
              return (
                <TextStep
                  key={step.id}
                  step={step}
                  onFileClick={onFileClick}
                />
              );
            case 'tool':
              return (
                <ToolStep
                  key={step.id}
                  step={step}
                  onToggleCollapse={() => onToggleStepCollapse(step.id)}
                  onFileClick={onFileClick}
                />
              );
            case 'subtask':
              return (
                <SubtaskStep
                  key={step.id}
                  step={step}
                  onToggleCollapse={() => onToggleStepCollapse(step.id)}
                />
              );
            default:
              return null;
          }
        })}
      </div>

      {/* Copy button */}
      {!isStreaming && steps.length > 0 && (
        <div className="pl-8 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy response'}
          </button>
        </div>
      )}
    </div>
  );
};
