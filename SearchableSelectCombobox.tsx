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
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const desktopListRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(options.map((o) => o.category))),
    [options]
  );

  const activeQuery = (isMobileViewport ? searchQuery : searchQuery).trim();
  const trimmedValue = value.trim();

  const filteredOptions = useMemo(() => {
    const tokens = activeQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((opt) => {
      if (activeCategory !== 'ALL' && opt.category !== activeCategory) return false;
      if (tokens.length === 0) return true;
      const haystack = `${opt.label} ${opt.category} ${opt.keywords || ''}`.toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [options, activeCategory, activeQuery]);

  const effectiveCustomCandidate = activeQuery || trimmedValue;
  const exactMatch = useMemo(
    () => options.some((opt) => opt.label.toLowerCase() === effectiveCustomCandidate.toLowerCase()),
    [options, effectiveCustomCandidate]
  );
  const showCustomOption = Boolean(effectiveCustomCandidate && !exactMatch);

  // Close desktop popover on outside pointerdown (ignoring touches inside mobile modal)
  useEffect(() => {
    if (!open || isMobileViewport) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, isMobileViewport]);

  // Focus sticky search bar cleanly inside mobile sheet when opened
  useEffect(() => {
    if (open && isMobileViewport) {
      setSearchQuery(value);
      const idTimer = window.setTimeout(() => {
        mobileSearchRef.current?.focus();
      }, 60);
      return () => window.clearTimeout(idTimer);
    }
  }, [open, isMobileViewport, value]);

  // Lock body scroll while mobile picker modal is open
  useEffect(() => {
    if (!open || !isMobileViewport) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isMobileViewport]);

  // Keep highlighted option scrolled into view on desktop keyboard nav
  useEffect(() => {
    if (!open || isMobileViewport || !desktopListRef.current) return;
    const activeEl = desktopListRef.current.querySelector<HTMLElement>(
      `[data-option-idx="${highlightedIdx}"]`
    );
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, open, isMobileViewport]);

  const selectOption = (nextVal: string) => {
    onChange(nextVal.slice(0, maxLength));
    setOpen(false);
    setSearchQuery('');
    setActiveCategory('ALL');
  };

  const openPicker = (filterFromValue: boolean) => {
    setOpen(true);
    setHighlightedIdx(0);
    setSearchQuery(filterFromValue ? value : '');
  };

  const handleDesktopKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isMobileViewport) return;

    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      openPicker(false);
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
      setSearchQuery('');
    }
  };

  const renderCategoryPills = () => (
    <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/60">
      <button
        type="button"
        onClick={() => {
          setActiveCategory('ALL');
          setHighlightedIdx(0);
        }}
        className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
          activeCategory === 'ALL'
            ? 'bg-indigo-600 text-white'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
        }`}
      >
        All ({options.length})
      </button>
      {categories.map((cat) => {
        const active = activeCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => {
              setActiveCategory(cat);
              setHighlightedIdx(0);
            }}
            className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              active
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${open ? 'z-50' : 'z-10'}`}>
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
          readOnly={isMobileViewport}
          onClick={() => {
            openPicker(false);
          }}
          onChange={(e) => {
            if (isMobileViewport) return;
            const nextVal = e.target.value;
            onChange(nextVal);
            setOpen(true);
            setSearchQuery(nextVal);
            setHighlightedIdx(0);
          }}
          onKeyDown={handleDesktopKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full rounded-lg border border-slate-200 bg-white py-2.5 sm:py-2 pl-9 pr-16 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${
            isMobileViewport ? 'cursor-pointer' : ''
          }`}
        />

        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearchQuery('');
                setOpen(true);
                setHighlightedIdx(0);
                if (!isMobileViewport) {
                  inputRef.current?.focus();
                }
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label={`Clear ${label}`}
              title="Clear and search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (open) {
                setOpen(false);
                setSearchQuery('');
              } else {
                openPicker(false);
                if (!isMobileViewport) {
                  inputRef.current?.focus();
                }
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
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

      {/* Desktop Dropdown Popover (>= 640px) */}
      <AnimatePresence>
        {open && !isMobileViewport && (
          <motion.div
            id={`${id}-listbox`}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            {renderCategoryPills()}

            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
              <span className="tabular-nums">
                {activeQuery
                  ? `${filteredOptions.length} matching ${allLabel}`
                  : `${filteredOptions.length} ${allLabel} · type to search or enter your own`}
              </span>
              {(activeQuery || activeCategory !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory('ALL');
                  }}
                  className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Show all
                </button>
              )}
            </div>

            {showCustomOption && (
              <button
                type="button"
                onClick={() => selectOption(effectiveCustomCandidate)}
                className="flex w-full items-center justify-between gap-2 border-b border-indigo-100 bg-indigo-50/70 px-3.5 py-2.5 text-left text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100/80 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Use &ldquo;{effectiveCustomCandidate}&rdquo;</span>
                </span>
                <span className="shrink-0 text-[10px] font-medium opacity-80">Custom entry</span>
              </button>
            )}

            <div
              ref={desktopListRef}
              className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70"
            >
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  No preset match found.{' '}
                  {effectiveCustomCandidate ? (
                    <>
                      Click above to use{' '}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        &ldquo;{effectiveCustomCandidate}&rdquo;
                      </span>{' '}
                      or save directly.
                    </>
                  ) : (
                    'Try clearing filters or typing your own.'
                  )}
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

      {/* Mobile Full-Visibility Picker Sheet (< 640px, never occluded by Samsung/iPhone keyboard) */}
      <AnimatePresence>
        {open && isMobileViewport && (
          <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-950 sm:hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  {label}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {filteredOptions.length} {allLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSearchQuery('');
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                aria-label="Close selector"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sticky Search & Custom Entry Box at Top */}
            <div className="border-b border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={mobileSearchRef}
                  type="text"
                  maxLength={maxLength}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (effectiveCustomCandidate) {
                        selectOption(effectiveCustomCandidate);
                      }
                    }
                  }}
                  placeholder={placeholder}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {showCustomOption && (
                <button
                  type="button"
                  onClick={() => selectOption(effectiveCustomCandidate)}
                  className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-left text-xs font-semibold text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/60 dark:text-indigo-200"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="truncate">Use &ldquo;{effectiveCustomCandidate}&rdquo;</span>
                  </span>
                  <span className="shrink-0 text-[11px] opacity-80">Tap to apply</span>
                </button>
              )}
            </div>

            {renderCategoryPills()}

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredOptions.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  No preset match found. Tap &ldquo;Use {effectiveCustomCandidate || 'your entry'}&rdquo; above to save your own institution or program.
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.label.toLowerCase() === trimmedValue.toLowerCase();
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => selectOption(opt.label)}
                      className={`flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/55 dark:text-indigo-200'
                          : 'text-slate-800 active:bg-slate-100 dark:text-slate-200 dark:active:bg-slate-800'
                      }`}
                    >
                      <span className="min-w-0 flex-1 font-medium leading-snug">{opt.label}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                        <span>{opt.category}</span>
                        {isSelected && (
                          <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
