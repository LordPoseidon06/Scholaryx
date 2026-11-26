import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT_EXPO } from './MotionPrimitives';
import type { AcademicOption } from '../data/ghanaAcademics';

interface SearchableSelectComboboxProps {
  id: string;
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  options: AcademicOption[];
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  helperText?: string;
  allLabel?: string;
}

export function SearchableSelectCombobox({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = 'Search or type...',
  required = false,
  maxLength = 150,
  helperText,
  allLabel = 'options',
}: SearchableSelectComboboxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const trimmedValue = value.trim();

  const filteredOptions = useMemo(() => {
    const q = isFiltering ? trimmedValue.toLowerCase() : '';
    if (!q) return options;
    const tokens = q.split(/\s+/).filter(Boolean);
    return options.filter((opt) => {
      const haystack = `${opt.label} ${opt.category} ${opt.keywords || ''}`.toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [options, isFiltering, trimmedValue]);

  const exactMatch = useMemo(
    () => options.some((opt) => opt.label.toLowerCase() === trimmedValue.toLowerCase()),
    [options, trimmedValue]
  );

  const showCustomOption = Boolean(trimmedValue && !exactMatch);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setIsFiltering(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  // Keep highlighted option scrolled into view on keyboard nav
  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-option-idx="${highlightedIdx}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, open]);

  const selectOption = (nextVal: string) => {
    onChange(nextVal.slice(0, maxLength));
    setOpen(false);
    setIsFiltering(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
      setIsFiltering(false);
      setHighlightedIdx(0);
      return;
    }

    if (!open) return;

    const totalItems = filteredOptions.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalItems > 0) {
        setHighlightedIdx((prev) => (prev + 1) % totalItems);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalItems > 0) {
        setHighlightedIdx((prev) => (prev - 1 + totalItems) % totalItems);
      }
    } else if (e.key === 'Enter') {
      if (totalItems > 0 && highlightedIdx >= 0 && highlightedIdx < totalItems) {
        e.preventDefault();
        selectOption(filteredOptions[highlightedIdx].label);
      } else if (trimmedValue) {
        e.preventDefault();
        selectOption(trimmedValue);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setIsFiltering(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          required={required}
          maxLength={maxLength}
          value={value}
          onFocus={() => {
            setOpen(true);
            setIsFiltering(false);
            setHighlightedIdx(0);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setIsFiltering(true);
            setHighlightedIdx(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-16 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />

        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(true);
                setIsFiltering(true);
                setHighlightedIdx(0);
                inputRef.current?.focus();
              }}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label={`Clear ${label}`}
              title="Clear and search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const nextOpen = !open;
              setOpen(nextOpen);
              setIsFiltering(false);
              setHighlightedIdx(0);
              if (nextOpen) {
                inputRef.current?.focus();
              }
            }}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label={`Toggle ${label} dropdown`}
            title="Browse full list"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {helperText && (
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{helperText}</p>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            id={`${id}-listbox`}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
              <span className="tabular-nums">
                {isFiltering && trimmedValue
                  ? `${filteredOptions.length} matching ${allLabel}`
                  : `${options.length} ${allLabel} · type to search or enter your own`}
              </span>
              {isFiltering && trimmedValue && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setIsFiltering(false)}
                  className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Show all
                </button>
              )}
            </div>

            {showCustomOption && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(trimmedValue)}
                className="flex w-full items-center justify-between gap-2 border-b border-indigo-100 bg-indigo-50/70 px-3.5 py-2.5 text-left text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100/80 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Use &ldquo;{trimmedValue}&rdquo;</span>
                </span>
                <span className="shrink-0 text-[10px] font-medium opacity-80">Custom entry</span>
              </button>
            )}

            <div ref={listRef} className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  No preset match found. Your typed entry{' '}
                  {trimmedValue ? (
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      &ldquo;{trimmedValue}&rdquo;
                    </span>
                  ) : null}{' '}
                  will be saved when you update your profile.
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.label.toLowerCase() === trimmedValue.toLowerCase();
                  const isHighlighted = idx === highlightedIdx;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-option-idx={idx}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      onClick={() => selectOption(opt.label)}
                      className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/55 dark:text-indigo-200'
                          : isHighlighted
                          ? 'bg-slate-100/80 text-slate-900 dark:bg-slate-800/80 dark:text-slate-100'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="min-w-0 flex-1 font-medium leading-snug">{opt.label}</span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                        <span>{opt.category}</span>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
