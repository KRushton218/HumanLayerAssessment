import React from 'react';
import { ChevronDown } from 'lucide-react';

interface ModelSelectorProps {
  model: string;
  onModelChange: (model: string) => void;
}

const MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
];

export const ModelSelector: React.FC<ModelSelectorProps> = ({ model, onModelChange }) => {
  return (
    <div className="relative">
      <select
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
    </div>
  );
};
