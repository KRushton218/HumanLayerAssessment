import React from 'react';
import { Circle, CheckCircle2, Loader2 } from 'lucide-react';
import type { Todo } from '../types';

interface TaskRowProps {
  task: Todo;
}

export const TaskRow: React.FC<TaskRowProps> = ({ task }) => {
  const config = {
    pending: {
      icon: <Circle size={16} className="text-slate-300" />,
      text: 'text-slate-500',
      bg: 'hover:bg-slate-50'
    },
    in_progress: {
      icon: <Loader2 size={16} className="text-amber-500 animate-spin" />,
      text: 'text-slate-900 font-medium',
      bg: 'bg-amber-50/50 border-l-2 border-amber-500 pl-3'
    },
    completed: {
      icon: <CheckCircle2 size={16} className="text-emerald-500" />,
      text: 'text-slate-400 line-through decoration-slate-300',
      bg: 'hover:bg-slate-50'
    }
  };

  const style = config[task.status];

  const baseClasses = "flex items-start gap-3 py-2.5 px-3 rounded-md transition-colors text-sm cursor-default";
  const layoutClasses = task.status === 'in_progress' ? baseClasses.replace('px-3', 'pr-3') : baseClasses;

  const points = task.points || 1;

  return (
    <div className={`${layoutClasses} ${style.bg}`}>
      <div className="mt-0.5 shrink-0">{style.icon}</div>
      <div className="flex-1 flex items-center justify-between gap-2">
        <span className={`leading-tight ${style.text}`}>{task.content}</span>
        <div className={`shrink-0 flex items-center justify-center min-w-[28px] h-5 px-2 rounded-full text-xs font-medium ${
          task.status === 'completed' 
            ? 'bg-emerald-100 text-emerald-700' 
            : task.status === 'in_progress'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-600'
        }`}>
          {points}pt${points === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
};
