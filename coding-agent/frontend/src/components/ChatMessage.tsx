import React from 'react';
import { User, Bot, Copy } from 'lucide-react';

export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content, isStreaming }) => {
  const isUser = role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  return (
    <div className={`group flex w-full gap-4 px-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`
        flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm
        ${isUser ? 'bg-blue-600 border-blue-700 text-white' : 'bg-white border-slate-200 text-slate-600'}
      `}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Content Bubble */}
      <div className={`
        relative max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm
        ${isUser
          ? 'bg-blue-600 text-white rounded-tr-sm'
          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}
      `}>
        <div className={`whitespace-pre-wrap ${isUser ? 'text-white' : 'text-slate-800'}`}>
          {content}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 align-middle bg-slate-400 animate-pulse" />
          )}
        </div>

        {/* Hover Actions (Copy) */}
        {!isStreaming && content && (
          <button
            onClick={handleCopy}
            className={`
              absolute -bottom-6 ${isUser ? 'right-0' : 'left-0'}
              opacity-0 group-hover:opacity-100 transition-opacity
              flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600
            `}
          >
            <Copy size={12} /> Copy
          </button>
        )}
      </div>
    </div>
  );
};
