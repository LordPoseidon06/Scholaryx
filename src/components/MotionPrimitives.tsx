import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, RotateCw } from 'lucide-react';

export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function PageTransition({
  sectionKey,
  children,
}: {
  sectionKey: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={sectionKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function ModalShell({
  open,
  onClose,
  maxWidthClass = 'max-w-2xl',
  children,
}: {
  open: boolean;
  onClose: () => void;
  maxWidthClass?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-xs"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className={`w-full ${maxWidthClass}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface SegmentedTabOption<T extends string> {
  id: T;
  label: string;
}

export function SegmentedTabs<T extends string>({
  layoutGroup,
  options,
  value,
  onChange,
  fullWidth = false,
  size = 'sm',
}: {
  layoutGroup: string;
  options: Array<SegmentedTabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  fullWidth?: boolean;
  size?: 'xs' | 'sm';
}) {
  return (
    <div
      className={`${
        fullWidth ? 'grid' : 'inline-flex flex-wrap items-center'
      } gap-1 rounded-lg border border-slate-200/80 bg-slate-100/90 p-1 dark:border-slate-800 dark:bg-slate-800/80`}
      style={
        fullWidth ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined
      }
    >
      {options.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative rounded-md ${
              size === 'xs' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-xs'
            } font-medium transition-colors whitespace-nowrap ${
              active
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutGroup}
                transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                className="absolute inset-0 rounded-md bg-white shadow-xs dark:bg-slate-900"
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AiErrorBanner({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
      className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="font-medium leading-relaxed">{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 whitespace-nowrap dark:border-red-800 dark:bg-red-950/60 dark:text-red-200 dark:hover:bg-red-900/50"
        >
          <RotateCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
          <span>{retrying ? 'Retrying...' : 'Retry'}</span>
        </button>
      )}
    </motion.div>
  );
}
