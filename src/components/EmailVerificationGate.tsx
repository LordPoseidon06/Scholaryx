import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, LogOut, Mail, Moon, RefreshCw, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function EmailVerificationGate() {
  const {
    user,
    authError,
    theme,
    toggleTheme,
    resendVerificationEmail,
    refreshVerificationStatus,
    logout,
  } = useAuth();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentNotice, setResentNotice] = useState<string | null>(null);

  useEffect(() => {
    const handleFocus = () => {
      void refreshVerificationStatus(true);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshVerificationStatus]);

  const handleCheck = async () => {
    setChecking(true);
    setResentNotice(null);
    try {
      await refreshVerificationStatus(false);
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResentNotice(null);
    try {
      await resendVerificationEmail();
      setResentNotice(`A fresh verification link was sent to ${user?.email}.`);
    } catch {
      // Displayed via authError
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <img
            src="/images/scholaris_crest_mark_1794794845025.jpg"
            alt="Scholaryx crest"
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-md border border-slate-200 object-cover dark:border-slate-700"
          />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Scholaryx
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col px-6 py-16">
        <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
            <Mail className="h-5 w-5" />
          </div>

          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Verify your email address
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            We sent a verification link to{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{user?.email}</span>.
            Open the link in your inbox to activate your Scholaryx student account and sync your courses.
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Using a university (.edu), Outlook, Yahoo, iCloud, or custom domain email? Check your spam or junk folder if the email takes more than a minute to arrive.
          </p>

          {resentNotice && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{resentNotice}</span>
            </div>
          )}

          {authError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {authError}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
            >
              {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              <span>{checking ? 'Checking Verification...' : "I've Verified My Email — Enter Workspace"}</span>
            </button>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {resending ? 'Sending...' : 'Resend Verification Email'}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Use a Different Email
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
