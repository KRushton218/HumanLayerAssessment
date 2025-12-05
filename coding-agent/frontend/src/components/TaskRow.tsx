import React, { useState } from 'react';
import { Circle, CheckCircle2, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import type { Todo } from '../types';

interface TaskRowProps {
  task: Todo;
  children?: Todo[];
  allTodos?: Todo[];
}

const statusConfig = {
  pending: {
    icon: <Circle size={14} className="text-slate-300 dark:text-slate-600" />,
    text: 'text-slate-500 dark:text-slate-400',
    bg: 'hover:bg-slate-100/50 dark:hover:bg-slate-700/50'
  },
  in_progress: {
    icon: <Loader2 size={14} className="text-amber-500 animate-spin" />,
    text: 'text-slate-900 dark:text-slate-100 font-medium',
    bg: 'bg-amber-50/50 dark:bg-amber-900/20 border-l-2 border-amber-500'
  },
  completed: {
    icon: <CheckCircle2 size={14} className="text-emerald-500" />,
    text: 'text-slate-400 dark:text-slate-500 line-through decoration-slate-300 dark:decoration-slate-600',
    bg: 'hover:bg-slate-100/50 dark:hover:bg-slate-700/50'
  }
};

// Simple task row (for children or standalone tasks)
const SimpleTaskRow: React.FC<{ task: Todo; isChild?: boolean }> = ({ task, isChild }) => {
  const style = statusConfig[task.status];
  const points = task.points || 1;

  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded transition-colors text-xs cursor-default ${style.bg} ${isChild ? 'ml-1' : ''}`}>
      <div className="shrink-0">{style.icon}</div>
      <span className={`flex-1 leading-tight truncate ${style.text}`}>{task.content}</span>
      <div className={`shrink-0 flex items-center justify-center min-w-[22px] h-4 px-1.5 rounded-full text-[10px] font-medium ${
        task.status === 'completed'
          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
          : task.status === 'in_progress'
          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      }`}>
        {points}
      </div>
    </div>
  );
};

// Parent task card with nested children
const ParentTaskCard: React.FC<{ task: Todo; children: Todo[] }> = ({ task, children }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const style = statusConfig[task.status];
  const points = task.points || 1;

  // Calculate progress
  const completedChildren = children.filter(c => c.status === 'completed').length;
  const progressPercent = children.length > 0 ? Math.round((completedChildren / children.length) * 100) : 0;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 overflow-hidden">
      {/* Parent header */}
      <div
        className={`flex items-center gap-2 py-2 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${
          task.status === 'in_progress' ? 'border-l-2 border-amber-500' : ''
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="shrink-0 text-slate-400 dark:text-slate-500">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="shrink-0">{style.icon}</div>
        <span className={`flex-1 text-sm leading-tight truncate ${style.text}`}>{task.content}</span>
        <div className={`shrink-0 flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full text-xs font-medium ${
          task.status === 'completed'
            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
            : task.status === 'in_progress'
            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
        }`}>
          {points}
        </div>
      </div>

      {/* Children */}
      {isExpanded && children.length > 0 && (
        <div className="px-2 pb-2 space-y-1 bg-white/50 dark:bg-slate-900/30">
          {children.map(child => (
            <SimpleTaskRow key={child.id} task={child} isChild />
          ))}
          {/* Progress bar */}
          <div className="mt-2 mx-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                {progressPercent}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const TaskRow: React.FC<TaskRowProps> = ({ task, children = [], allTodos = [] }) => {
  // If this task has children, render as parent card
  const taskChildren = children.length > 0
    ? children
    : allTodos.filter(t => t.parentId === task.id);

  if (taskChildren.length > 0) {
    return <ParentTaskCard task={task} children={taskChildren} />;
  }

  // Otherwise render as simple row
  return <SimpleTaskRow task={task} />;
};
