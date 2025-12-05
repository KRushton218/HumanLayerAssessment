import React from 'react';
import type { ContextUsage } from '../types';

interface ContextMeterProps {
  usage: ContextUsage;
}

export const ContextMeter: React.FC<ContextMeterProps> = ({ usage }) => {
  const getColor = () => {
    if (usage.percentage >= 40) return 'bg-red-500';
    if (usage.percentage >= 32) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 dark:text-slate-500">Context:</span>
      <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all duration-300`}
          style={{ width: `${Math.min(usage.percentage, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${usage.warning ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
        {usage.percentage.toFixed(0)}%
      </span>
    </div>
  );
};
