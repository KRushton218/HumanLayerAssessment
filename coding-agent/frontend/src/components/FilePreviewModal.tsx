import React, { useEffect, useState } from 'react';
import { X, Copy, Check, Loader2, FileText, AlertCircle } from 'lucide-react';
import { readFile } from '../api';

interface FilePreviewModalProps {
  filePath: string | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ filePath, onClose }) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setContent(null);

    readFile(filePath)
      .then(data => {
        setContent(data.content);
        setTruncated(data.truncated);
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [filePath]);

  const handleCopyPath = () => {
    if (filePath) {
      navigator.clipboard.writeText(filePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!filePath) return null;

  // Get filename from path
  const fileName = filePath.split('/').pop() || filePath;

  // Detect language from file extension for potential syntax highlighting
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const getLanguageLabel = (ext: string) => {
    const langMap: Record<string, string> = {
      ts: 'TypeScript',
      tsx: 'TypeScript React',
      js: 'JavaScript',
      jsx: 'JavaScript React',
      py: 'Python',
      rs: 'Rust',
      go: 'Go',
      java: 'Java',
      json: 'JSON',
      md: 'Markdown',
      css: 'CSS',
      html: 'HTML',
      yml: 'YAML',
      yaml: 'YAML',
      sh: 'Shell',
      bash: 'Bash',
    };
    return langMap[ext] || ext.toUpperCase();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[700px] max-w-[90vw] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={16} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="font-mono text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {fileName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {filePath}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 dark:text-slate-500 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
              {getLanguageLabel(extension)}
            </span>
            <button
              onClick={handleCopyPath}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
              title="Copy path"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-slate-900">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={24} className="text-slate-400 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-64 text-red-400">
              <AlertCircle size={32} className="mb-2" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {content !== null && !loading && !error && (
            <div className="relative">
              <pre className="p-4 text-sm font-mono text-slate-100 leading-relaxed overflow-x-auto whitespace-pre">
                {content.split('\n').map((line, i) => (
                  <div key={i} className="flex">
                    <span className="select-none text-slate-500 text-right pr-4 min-w-[3rem]">
                      {i + 1}
                    </span>
                    <code>{line || ' '}</code>
                  </div>
                ))}
              </pre>
              {truncated && (
                <div className="sticky bottom-0 bg-gradient-to-t from-slate-900 to-transparent py-4 text-center">
                  <span className="text-xs text-amber-400 bg-amber-900/30 px-3 py-1 rounded-full">
                    File truncated (showing first 100KB)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
