import React, { useState } from 'react';
import type { ContextUsage } from '../types';

interface ContextMeterProps {
  usage: ContextUsage;
}

/**
 * Format token count for display (e.g., 1234 -> "1.2k", 123456 -> "123k")
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

export const ContextMeter: React.FC<ContextMeterProps> = ({ usage }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const getColor = () => {
    if (usage.atSoftLimit || usage.percentage >= 40) return 'bg-red-500';
    if (usage.warning || usage.percentage >= 32) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getTextColor = () => {
    if (usage.atSoftLimit || usage.percentage >= 40) return 'text-red-500';
    if (usage.warning || usage.percentage >= 32) return 'text-amber-500';
    return 'text-slate-400 dark:text-slate-500';
  };

  // Handle both new format and legacy format
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? usage.tokens ?? 0;
  const maxTokens = usage.maxTokens ?? 200000;

  return (
    <div
      className="relative flex items-center gap-2"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="text-xs text-slate-400 dark:text-slate-500">Context:</span>
      <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all duration-300`}
          style={{ width: `${Math.min(usage.percentage, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${getTextColor()}`}>
        {usage.percentage.toFixed(1)}%
      </span>

      {/* Tooltip with detailed breakdown */}
      {showTooltip && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-slate-800 dark:bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 min-w-[200px]">
          <div className="text-xs space-y-2">
            <div className="font-semibold text-slate-200 border-b border-slate-700 pb-1 mb-2">
              Token Usage
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">Input:</span>
              <span className="text-slate-200 font-mono">{formatTokens(inputTokens)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">Output:</span>
              <span className="text-slate-200 font-mono">{formatTokens(outputTokens)}</span>
            </div>

            <div className="flex justify-between border-t border-slate-700 pt-1">
              <span className="text-slate-400">Total:</span>
              <span className="text-slate-200 font-mono font-semibold">{formatTokens(totalTokens)}</span>
            </div>

            <div className="flex justify-between text-slate-500">
              <span>Max:</span>
              <span className="font-mono">{formatTokens(maxTokens)}</span>
            </div>

            {/* Status indicators */}
            <div className="border-t border-slate-700 pt-2 mt-2">
              {usage.atSoftLimit ? (
                <div className="text-red-400 text-xs">
                  Approaching context limit
                </div>
              ) : usage.warning ? (
                <div className="text-amber-400 text-xs">
                  Context usage warning
                </div>
              ) : (
                <div className="text-emerald-400 text-xs">
                  Context usage normal
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
