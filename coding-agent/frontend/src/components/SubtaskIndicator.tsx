import React from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { SubtaskStatus } from '../types';

interface SubtaskIndicatorProps {
  subtask: SubtaskStatus | null;
}

export const SubtaskIndicator: React.FC<SubtaskIndicatorProps> = ({ subtask }) => {
  if (!subtask) return null;

  const getIcon = () => {
    switch (subtask.status) {
      case 'running':
        return <Loader2 size={14} className="text-amber-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 size={14} className="text-emerald-500" />;
      case 'failed':
        return <XCircle size={14} className="text-red-500" />;
    }
  };

  return (
    <div className="mx-4 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        {getIcon()}
        <span className="text-xs font-semibold text-slate-700">
          {subtask.status === 'running' ? 'Subtask Running' :
           subtask.status === 'completed' ? 'Subtask Complete' : 'Subtask Failed'}
        </span>
      </div>
      <p className="text-xs text-slate-500 truncate">{subtask.prompt}</p>
      {subtask.summary && (
        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{subtask.summary}</p>
      )}
    </div>
  );
};
