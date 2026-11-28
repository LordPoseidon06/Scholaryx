import React from 'react';
import { motion } from 'motion/react';
import { LogOut, Moon, ShieldAlert, Sun } from 'lucide-react';
import { ScholaryxLogo } from './BrandLogo';
import { EASE_OUT_EXPO } from './MotionPrimitives';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/utils';

export function BlockedAccountGate() {
  const { user, blockedRecord, theme, toggleTheme, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <ScholaryxLogo size="md" />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Scholaryx
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
          className="rounded-xl border border-rose-200 bg-white p-8 shadow-sm dark:border-rose-900/60 dark:bg-slate-900"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
            <ShieldAlert className="h-5 w-5" />
          </div>

          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Workspace Access Restricted
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Your account ({user?.email || 'signed-in user'}) has been blocked by an administrator and cannot access materials, past questions, or peer chats.
          </p>

          {blockedRecord?.reason && (
            <div className="mt-4 rounded-lg border border-rose-200/80 bg-rose-50/70 px-4 py-3 dark:border-rose-900/50 dark:bg-rose-950/30">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                Administrator Note
              </p>
              <p className="mt-1 text-xs leading-relaxed text-rose-900 dark:text-rose-100">
                {blockedRecord.reason}
              </p>
              {blockedRecord.updatedAt ? (
                <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                  Updated {formatTimestamp(blockedRecord.updatedAt)}
                </p>
              ) : null}
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={() => void logout()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
