import React, { useMemo } from 'react';
import { Copy, Check, FileText, FolderOpen } from 'lucide-react';
import type { AssistantStep } from '../../types';

interface TextStepProps {
  step: AssistantStep;
  onFileClick?: (path: string) => void;
}

// Simple markdown-like parser for code blocks, lists, and formatting
function parseContent(content: string, onFileClick?: (path: string) => void): React.ReactNode[] {
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
      i++;
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
      elements.push(<BulletList key={key++} items={items} onFileClick={onFileClick} />);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('```') && !lines[i].match(/^[-*]\s+/)) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      elements.push(
        <Paragraph key={key++} text={paragraphLines.join(' ')} onFileClick={onFileClick} />
      );
    }
  }

  return elements;
}

// Inline formatting: **bold**, `code`, paths
function formatInline(text: string, onFileClick?: (path: string) => void): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const pathMatch = remaining.match(/((?:\/[\w.-]+)+\.[\w]+|~\/[\w./-]+\.[\w]+)/);

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

    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index));
    }

    if (earliest.type === 'bold') {
      parts.push(<strong key={key++} className="font-semibold text-slate-900 dark:text-slate-100">{earliest.match[1]}</strong>);
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === 'code') {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-[13px] font-mono">
          {earliest.match[1]}
        </code>
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === 'path') {
      const filePath = earliest.match[0];
      parts.push(
        <button
          key={key++}
          onClick={() => onFileClick?.(filePath)}
          className="font-mono text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 hover:underline cursor-pointer"
        >
          {filePath}
        </button>
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    }
  }

  return parts;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 max-w-full">
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
      <pre className="p-3 overflow-x-auto text-sm font-mono text-slate-100 leading-relaxed max-w-full">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function FileList({ files }: { files: { name: string; desc: string }[] }) {
  return (
    <div className="my-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
      {files.map((file, i) => {
        const isDir = file.name.endsWith('/') || file.desc.toLowerCase().includes('directory') || file.desc.toLowerCase().includes('folder');
        return (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-slate-200 dark:border-slate-700' : ''}`}
          >
            {isDir ? (
              <FolderOpen size={14} className="text-amber-500 flex-shrink-0" />
            ) : (
              <FileText size={14} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
            )}
            <span className="font-mono text-sm text-slate-800 dark:text-slate-200 font-medium">{file.name}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{file.desc}</span>
          </div>
        );
      })}
    </div>
  );
}

function BulletList({ items, onFileClick }: { items: string[]; onFileClick?: (path: string) => void }) {
  return (
    <ul className="my-2 space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
          <span className="text-slate-400 dark:text-slate-500 select-none">•</span>
          <span>{formatInline(item, onFileClick)}</span>
        </li>
      ))}
    </ul>
  );
}

function Paragraph({ text, onFileClick }: { text: string; onFileClick?: (path: string) => void }) {
  return (
    <p className="my-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      {formatInline(text, onFileClick)}
    </p>
  );
}

export const TextStep: React.FC<TextStepProps> = ({ step, onFileClick }) => {
  const parsedContent = useMemo(() => {
    return parseContent(step.content || '', onFileClick);
  }, [step.content, onFileClick]);

  return (
    <div className="relative">
      {parsedContent}
      {step.isStreaming && (
        <span className="inline-block w-2 h-4 bg-slate-400 dark:bg-slate-500 animate-pulse ml-0.5" />
      )}
    </div>
  );
};
