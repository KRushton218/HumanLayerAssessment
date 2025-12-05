import React from 'react';
import { RotateCcw, GitFork, Clock } from 'lucide-react';
import type { Checkpoint } from '../types';

interface CheckpointControlsProps {
  checkpoints: Checkpoint[];
  onRevert: (checkpointId: string) => void;
  onFork: (checkpointId: string) => void;
}

export const CheckpointControls: React.FC<CheckpointControlsProps> = ({
  checkpoints,
  onRevert,
  onFork
}) => {
  if (checkpoints.length === 0) return null;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-4 border-t border-slate-200">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
        Checkpoints
      </h3>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {checkpoints.slice(0, 5).map((cp) => (
          <div
            key={cp.id}
            className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock size={12} />
              <span>{formatTime(cp.timestamp)}</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => onRevert(cp.id)}
                className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-blue-600 transition-colors"
                title="Revert to checkpoint"
              >
                <RotateCcw size={12} />
              </button>
              <button
                onClick={() => onFork(cp.id)}
                className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-emerald-600 transition-colors"
                title="Fork from checkpoint"
              >
                <GitFork size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
