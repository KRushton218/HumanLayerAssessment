import React, { useMemo } from 'react';
import { User, Terminal, Copy, Check, FileText, FolderOpen } from 'lucide-react';

export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

// Simple markdown-like parser for code blocks, lists, and formatting
function parseContent(content: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const lines = content.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (```)
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <CodeBlock key={key++} code={codeLines.join('\n')} language={lang} />
      );
      i++; // Skip closing ```
      continue;
    }

    // File listing pattern (- **filename** - description)
    const fileMatch = line.match(/^-\s+\*\*(.+?)\*\*\s*[-–]\s*(.+)$/);
    if (fileMatch) {
      const files: { name: string; desc: string }[] = [];
      while (i < lines.length) {
        const match = lines[i].match(/^-\s+\*\*(.+?)\*\*\s*[-–]\s*(.+)$/);
        if (match) {
          files.push({ name: match[1], desc: match[2] });
          i++;
        } else {
          break;
        }
      }
      elements.push(<FileList key={key++} files={files} />);
      continue;
    }

    // Regular bullet list
    if (line.match(/^[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      elements.push(<BulletList key={key++} items={items} />);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph - collect consecutive non-empty lines
    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('```') && !lines[i].match(/^[-*]\s+/)) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      elements.push(
        <Paragraph key={key++} text={paragraphLines.join(' ')} />
      );
    }
  }

  return elements;
}

// Inline formatting: **bold**, `code`, paths
function formatInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code `code`
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Path detection (starts with / or ~/ or contains common path patterns)
    const pathMatch = remaining.match(/((?:\/[\w.-]+)+|~\/[\w./-]+)/);

    // Find the earliest match
    let earliest: { type: string; match: RegExpMatchArray; index: number } | null = null;

    if (boldMatch && boldMatch.index !== undefined) {
      earliest = { type: 'bold', match: boldMatch, index: boldMatch.index };
    }
    if (codeMatch && codeMatch.index !== undefined) {
      if (!earliest || codeMatch.index < earliest.index) {
        earliest = { type: 'code', match: codeMatch, index: codeMatch.index };
      }
    }
    if (pathMatch && pathMatch.index !== undefined) {
      if (!earliest || pathMatch.index < earliest.index) {
        // Only use path match if it's not inside code or bold
        if (!boldMatch || pathMatch.index < (boldMatch.index ?? Infinity)) {
          if (!codeMatch || pathMatch.index < (codeMatch.index ?? Infinity)) {
            earliest = { type: 'path', match: pathMatch, index: pathMatch.index };
          }
        }
      }
    }

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    // Add text before the match
    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index));
    }

    // Add the formatted element
    if (earliest.type === 'bold') {
      parts.push(<strong key={key++} className="font-semibold text-slate-900">{earliest.match[1]}</strong>);
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === 'code') {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[13px] font-mono">
          {earliest.match[1]}
        </code>
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === 'path') {
      parts.push(
        <span key={key++} className="font-mono text-amber-700 bg-amber-50 px-1 rounded">
          {earliest.match[0]}
        </span>
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    }
  }

  return parts;
}

// Components for different content types
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-slate-200 bg-slate-900">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700">
        <span className="text-xs text-slate-400 font-mono">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-sm font-mono text-slate-100 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function FileList({ files }: { files: { name: string; desc: string }[] }) {
  return (
    <div className="my-3 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
      {files.map((file, i) => {
        const isDir = file.name.endsWith('/') || file.desc.toLowerCase().includes('directory') || file.desc.toLowerCase().includes('folder');
        return (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-slate-200' : ''}`}
          >
            {isDir ? (
              <FolderOpen size={14} className="text-amber-500 flex-shrink-0" />
            ) : (
              <FileText size={14} className="text-slate-400 flex-shrink-0" />
            )}
            <span className="font-mono text-sm text-slate-800 font-medium">{file.name}</span>
            <span className="text-xs text-slate-500">{file.desc}</span>
          </div>
        );
      })}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="my-2 space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-700">
          <span className="text-slate-400 select-none">•</span>
          <span>{formatInline(item)}</span>
        </li>
      ))}
    </ul>
  );
}

function Paragraph({ text }: { text: string }) {
  return (
    <p className="my-2 text-sm text-slate-700 leading-relaxed">
      {formatInline(text)}
    </p>
  );
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content, isStreaming }) => {
  const isUser = role === 'user';

  const parsedContent = useMemo(() => {
    if (isUser) return null;
    return parseContent(content);
  }, [content, isUser]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  // User message - simple right-aligned
  if (isUser) {
    return (
      <div className="flex justify-end mb-6">
        <div className="flex items-start gap-3 max-w-[70%]">
          <div className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm">
            {content}
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
            <User size={14} />
          </div>
        </div>
      </div>
    );
  }

  // Assistant message - full width, IDE style
  return (
    <div className="group mb-6">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-500">
          <Terminal size={12} />
        </div>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Agent</span>
        {isStreaming && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Working...
          </span>
        )}
      </div>

      <div className="pl-8 pr-4">
        {parsedContent}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-slate-400 animate-pulse ml-0.5" />
        )}
      </div>

      {/* Copy button */}
      {!isStreaming && content && (
        <div className="pl-8 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          >
            <Copy size={12} /> Copy response
          </button>
        </div>
      )}
    </div>
  );
};
