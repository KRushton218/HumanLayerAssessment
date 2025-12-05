import React, { useState } from 'react';
import { SendHorizontal, Sparkles } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled }) => {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSend(value);
      setValue('');
    }
  };

  return (
    <div className="p-6 bg-gradient-to-t from-white via-white to-transparent dark:from-slate-900 dark:via-slate-900">
      <form
        onSubmit={handleSubmit}
        className={`
          relative flex items-center gap-2 rounded-xl border bg-white dark:bg-slate-800 p-2 shadow-sm transition-all
          ${disabled ? 'border-slate-100 dark:border-slate-700 opacity-70 cursor-not-allowed' : 'border-slate-300 dark:border-slate-600 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10'}
        `}
      >
        <div className="pl-2 text-slate-400 dark:text-slate-500">
          <Sparkles size={18} />
        </div>

        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Agent is working..." : "Describe a task for the agent..."}
          className="flex-1 border-none bg-transparent px-2 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-0"
        />

        <button
          type="submit"
          disabled={!value.trim() || disabled}
          className={`
            rounded-lg p-2 transition-all
            ${value.trim() && !disabled
              ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 hover:shadow-lg'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'}
          `}
        >
          <SendHorizontal size={18} />
        </button>
      </form>
    </div>
  );
};
