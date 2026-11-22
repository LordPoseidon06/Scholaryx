import React, { useState } from 'react';
import { ArrowRight, BookOpen, Calendar, CheckSquare, FileText, MessageSquare, Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LandingAuth() {
  const { signInWithGoogle, authError, theme, toggleTheme } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Handled by context authError
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* 3-Zone Top Bar Contract */}
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-8 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <a href="#top" className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-slate-100">
          Scholaryx
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <a href="#past-papers" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white">
            Past Papers
          </a>
          <a href="#ai-studio" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white">
            AI Studio
          </a>
          <a href="#planning" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white">
            Planning
          </a>
          <a href="#peers" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-white">
            Peer Network
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            {signingIn ? 'Signing in...' : 'Sign In with Google'}
          </button>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
        {/* Balanced 2-Column Split Hero */}
        <section className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
          <div className="flex flex-col justify-between gap-8 lg:col-span-6">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <img
                  src="/src/assets/images/scholaris_crest_mark_1794794845025.jpg"
                  alt="Scholaryx academic emblem"
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 rounded-lg border border-slate-200 object-cover dark:border-slate-800"
                />
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  University Academic Workspace · Course Collaboration · AI Retention
                </div>
              </div>

              <h1
                className="font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-slate-100"
                style={{ textWrap: 'balance' }}
              >
                Every course note, past paper, deadline, and study partner in one calm workspace.
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                Built for university students managing heavy coursework. Archive and share past exam questions, upload lecture slides, turn dense readings into active-recall quizzes with AI, track assignments and GPA targets, and message classmates reading the same course.
              </p>

              {authError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {authError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={signingIn}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <span>{signingIn ? 'Connecting Account...' : 'Enter Your Study Workspace'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 border-t border-slate-200 pt-6 dark:border-slate-800">
              <div>
                <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  Courses
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Shared past papers &amp; lecture decks by code
                </p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  AI Lab
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Instant summaries, MCQs &amp; flashcards
                </p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  Real-Time
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Peer discovery &amp; direct resource sharing
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-full min-h-[340px] overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-900">
              <img
                src="/src/assets/images/campus_library_hero_1794794846363.jpg"
                alt="University library study tables in morning daylight"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover lg:h-full"
              />
            </div>
          </div>
        </section>

        {/* Core Academic Modules */}
        <section id="past-papers" className="mt-16 border-t border-slate-200 pt-12 dark:border-slate-800">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Built around the full semester workflow
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Every tool connects to your enrolled courses so resources, deadlines, and classmates stay organized together.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <FileText className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Past Questions Archive
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Upload midterms, finals, and worked solutions tagged by course code, semester, and year for peers reading the same course.
              </p>
            </div>

            <div id="ai-studio" className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <Sparkles className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                AI Summaries &amp; Retention Quizzes
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Convert uploaded notes, slides, and PDFs into structured revision guides, active-recall flashcards, and graded practice quizzes.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <BookOpen className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Shared Notes &amp; Slide Decks
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Publish lecture notes, lab guides, and cheat sheets to your course library and share materials straight into peer conversations.
              </p>
            </div>

            <div id="planning" className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <Calendar className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Exam &amp; Assignment Calendar
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Track upcoming exam dates, assignment deadlines, lectures, and planned study blocks with live countdown indicators.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <CheckSquare className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Tasks &amp; Study Progress
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Manage coursework priorities across board and list views while tracking course grades, study hours, and quiz retention.
              </p>
            </div>

            <div id="peers" className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <MessageSquare className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Course Peer Finder &amp; Chat
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Create your student profile, discover classmates enrolled in the same courses, and collaborate in real-time messaging.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto mt-12 flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-6 py-8 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>Scholaryx Academic Platform</span>
        <div className="flex items-center gap-4">
          <span>Google Account Sign-In</span>
          <span aria-hidden="true">·</span>
          <span>Real-Time Cloud Sync</span>
        </div>
      </footer>
    </div>
  );
}
