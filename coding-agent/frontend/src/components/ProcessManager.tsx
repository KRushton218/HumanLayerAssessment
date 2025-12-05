import React, { useState, useEffect, useCallback } from 'react';
import { Terminal, X, RefreshCw, Clock } from 'lucide-react';
import { getProcesses, killProcess, ProcessInfo } from '../api';

interface ProcessManagerProps {
  sessionId: string | null;
}

export const ProcessManager: React.FC<ProcessManagerProps> = ({ sessionId }) => {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [killingId, setKillingId] = useState<string | null>(null);

  const fetchProcesses = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const data = await getProcesses(sessionId);
      setProcesses(data.processes);
    } catch (err) {
      console.error('Failed to fetch processes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Fetch processes on mount and periodically
  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, [fetchProcesses]);

  const handleKill = async (processId: string) => {
    if (!sessionId) return;
    setKillingId(processId);
    try {
      await killProcess(sessionId, processId);
      setProcesses(prev => prev.filter(p => p.id !== processId));
    } catch (err) {
      console.error('Failed to kill process:', err);
    } finally {
      setKillingId(null);
    }
  };

  const formatRuntime = (startTime: number) => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  if (processes.length === 0) {
    return null; // Don't show if no processes
  }

  return (
    <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <Terminal size={12} />
          Background Processes
        </h3>
        <button
          onClick={fetchProcesses}
          disabled={isLoading}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="space-y-2">
        {processes.map(proc => (
          <div
            key={proc.id}
            className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate" title={proc.command}>
                {proc.command}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                <span className="truncate" title={proc.cwd}>{proc.cwd}</span>
                <span className="flex items-center gap-0.5">
                  <Clock size={10} />
                  {formatRuntime(proc.startTime)}
                </span>
              </div>
            </div>
            <button
              onClick={() => handleKill(proc.id)}
              disabled={killingId === proc.id}
              className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
              title="Stop process"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
