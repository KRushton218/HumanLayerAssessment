import React, { useState } from 'react';
import { FolderOpen, Check, X, Loader2 } from 'lucide-react';

interface TargetSelectorProps {
  targetDirectory: string;
  onTargetChange: (targetDirectory: string) => Promise<void>;
}

export const TargetSelector: React.FC<TargetSelectorProps> = ({
  targetDirectory,
  onTargetChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(targetDirectory);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setIsValidating(true);
    setError(null);

    try {
      await onTargetChange(inputValue.trim());
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set target');
    } finally {
      setIsValidating(false);
    }
  };

  const handleCancel = () => {
    setInputValue(targetDirectory);
    setError(null);
    setIsEditing(false);
  };

  // Get short display name (last part of path)
  const displayName = targetDirectory.split('/').pop() || targetDirectory;

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors max-w-[200px]"
        title={targetDirectory}
      >
        <FolderOpen size={14} className="text-amber-500 flex-shrink-0" />
        <span className="truncate">{displayName}</span>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
            <FolderOpen size={14} />
          </div>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="/path/to/project"
            className={`w-64 pl-8 pr-2 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
              error
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'
            }`}
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={!inputValue.trim() || isValidating}
          className="p-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Set target"
        >
          {isValidating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="p-1.5 text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          title="Cancel"
        >
          <X size={14} />
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-500 pl-1">{error}</p>
      )}
    </form>
  );
};
