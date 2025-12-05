import React from 'react';
import { Check, X } from 'lucide-react';
import type { ToolRun } from '../types';

interface ToolStatusItemProps {
  tool: ToolRun;
}

export const ToolStatusItem: React.FC<ToolStatusItemProps> = ({ tool }) => {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0 overflow-hidden">
      <div className="shrink-0">
        {tool.status === 'running' && (
          <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
        )}
        {tool.status === 'completed' && <Check size={12} className="text-emerald-500" />}
        {tool.status === 'failed' && <X size={12} className="text-red-500" />}
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-slate-700 font-medium shrink-0">{tool.name}</span>
          {tool.summary && (
            <span className="text-xs text-slate-400 truncate">
              - {tool.summary}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
