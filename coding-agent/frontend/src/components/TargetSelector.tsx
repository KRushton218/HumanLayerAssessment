import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, Check, X, Loader2, ChevronRight } from 'lucide-react';
import { completeTarget } from '../api';

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

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch suggestions when input changes
  const fetchSuggestions = useCallback(async (partial: string) => {
    if (!partial) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const result = await completeTarget(partial);
      setSuggestions(result.suggestions);
      setSelectedIndex(-1);
      setShowSuggestions(result.suggestions.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  // Debounced input change handler
  useEffect(() => {
    if (!isEditing) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(inputValue);
    }, 150);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue, isEditing, fetchSuggestions]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;

    setIsValidating(true);
    setError(null);
    setShowSuggestions(false);

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
    setShowSuggestions(false);
    setSuggestions([]);
    setIsEditing(false);
  };

  const selectSuggestion = (suggestion: string) => {
    // Add trailing slash to encourage further completion
    const newValue = suggestion.endsWith('/') ? suggestion : suggestion + '/';
    setInputValue(newValue);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
    // Trigger new suggestions for the subdirectory
    fetchSuggestions(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions && suggestions.length === 0 && e.key !== 'Tab') {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter') {
        handleSubmit();
      }
      return;
    }

    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        if (suggestions.length === 1) {
          // Only one suggestion - complete it
          selectSuggestion(suggestions[0]);
        } else if (suggestions.length > 1) {
          // Multiple suggestions - show them
          setShowSuggestions(true);
          if (selectedIndex === -1) {
            setSelectedIndex(0);
          } else {
            // Tab through suggestions
            setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          }
        } else if (!showSuggestions && inputValue) {
          // No suggestions yet - fetch them
          fetchSuggestions(inputValue);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (showSuggestions) {
          setSelectedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
        } else if (suggestions.length > 0) {
          setShowSuggestions(true);
          setSelectedIndex(0);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (showSuggestions) {
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (showSuggestions && selectedIndex >= 0) {
          selectSuggestion(suggestions[selectedIndex]);
        } else {
          handleSubmit();
        }
        break;

      case 'Escape':
        if (showSuggestions) {
          setShowSuggestions(false);
          setSelectedIndex(-1);
        } else {
          handleCancel();
        }
        break;
    }
  };

  // Scroll selected suggestion into view
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionsRef.current) {
      const selectedEl = suggestionsRef.current.children[selectedIndex] as HTMLElement;
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

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
    <form onSubmit={handleSubmit} className="relative flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
            <FolderOpen size={14} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={() => {
              // Delay to allow click on suggestion
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            placeholder="/path/to/project or ~/project"
            className={`w-80 pl-8 pr-2 py-1.5 text-xs font-mono bg-white border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
              error
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'
            }`}
            autoComplete="off"
            spellCheck={false}
          />
          {isLoadingSuggestions && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Loader2 size={12} className="animate-spin text-slate-400" />
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={!inputValue.trim() || isValidating}
          className="p-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Set target (Enter)"
        >
          {isValidating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="p-1.5 text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          title="Cancel (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 mt-1 w-80 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50"
        >
          {suggestions.map((suggestion, index) => {
            const parts = suggestion.split('/');
            const dirName = parts[parts.length - 1] || parts[parts.length - 2];
            const parentPath = parts.slice(0, -1).join('/');

            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => selectSuggestion(suggestion)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left font-mono hover:bg-slate-50 ${
                  index === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                }`}
              >
                <FolderOpen size={12} className="text-amber-500 flex-shrink-0" />
                <span className="truncate">
                  <span className="text-slate-400">{parentPath}/</span>
                  <span className="font-medium">{dirName}</span>
                </span>
                <ChevronRight size={12} className="ml-auto text-slate-300 flex-shrink-0" />
              </button>
            );
          })}
          <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100 bg-slate-50">
            Tab to complete • ↑↓ to navigate • Enter to select
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 pl-1">{error}</p>
      )}
    </form>
  );
};
