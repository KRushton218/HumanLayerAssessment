import React, { useState } from 'react';
import { RotateCcw, GitFork, Clock, AlertTriangle } from 'lucide-react';
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
  const [confirmRevert, setConfirmRevert] = useState<string | null>(null);

  if (checkpoints.length === 0) return null;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleRevertClick = (checkpointId: string) => {
    setConfirmRevert(checkpointId);
  };

  const handleConfirmRevert = () => {
    if (confirmRevert) {
      onRevert(confirmRevert);
      setConfirmRevert(null);
    }
  };

  const handleCancelRevert = () => {
    setConfirmRevert(null);
  };

  const getCheckpointToConfirm = () => {
    return checkpoints.find(cp => cp.id === confirmRevert);
  };

  return (
    <>
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Checkpoints
        </h3>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {checkpoints.slice(0, 5).map((cp) => (
            <div
              key={cp.id}
              className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group"
              title={cp.actionSummary}
            >
              <div className="flex flex-col min-w-0 flex-1">
                {cp.name ? (
                  <>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {cp.name}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Clock size={10} />
                      {formatTime(cp.timestamp)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock size={12} />
                    {formatTime(cp.timestamp)}
                  </span>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleRevertClick(cp.id)}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors"
                  title="Revert to checkpoint"
                >
                  <RotateCcw size={12} />
                </button>
                <button
                  onClick={() => onFork(cp.id)}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 hover:text-emerald-600 transition-colors"
                  title="Fork from checkpoint"
                >
                  <GitFork size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Revert Confirmation Dialog */}
      {confirmRevert && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[400px] max-w-[90vw] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-500 text-white">
              <AlertTriangle size={20} />
              <h3 className="font-semibold">Confirm Revert</h3>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                Are you sure you want to revert to this checkpoint?
              </p>
              {getCheckpointToConfirm() && (
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {getCheckpointToConfirm()?.name || 'Unnamed checkpoint'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {formatTime(getCheckpointToConfirm()!.timestamp)}
                  </p>
                  {getCheckpointToConfirm()?.actionSummary && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 truncate">
                      {getCheckpointToConfirm()?.actionSummary}
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                This will undo all changes made after this checkpoint.
              </p>
            </div>
            <div className="flex gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 justify-end">
              <button
                onClick={handleCancelRevert}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevert}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded font-medium text-sm transition-colors"
              >
                Revert
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
