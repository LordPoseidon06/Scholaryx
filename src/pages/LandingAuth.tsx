import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Eye,
  EyeOff,
  FileText,
  Mail,
  MessageSquare,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'signup' | 'signin' | 'reset';

export function LandingAuth() {
  const {
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    sendPasswordReset,
    authError,
    clearAuthError,
    theme,
    toggleTheme,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signup');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [university, setUniversity] = useState('');
  const [program, setProgram] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const authCardRef = useRef<HTMLDivElement | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError(null);
    setResetSuccess(null);
    clearAuthError();
  };

  const focusAuthCard = (targetMode: AuthMode) => {
    switchMode(targetMode);
    authCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    setResetSuccess(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
    } catch {
      // Handled by context authError
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetSuccess(null);
    clearAuthError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setLocalError('Please enter a valid email address (for example, name@university.edu or you@outlook.com).');
      return;
    }

    if (mode === 'reset') {
      setSubmitting(true);
      try {
        await sendPasswordReset(trimmedEmail);
        setResetSuccess(`Password reset link sent to ${trimmedEmail}. Check your inbox.`);
      } catch {
        // Handled by context authError
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }

    if (mode === 'signup') {
      if (!displayName.trim()) {
        setLocalError('Please enter your full name.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.');
        return;
      }

      setSubmitting(true);
      try {
        await signUpWithEmail({
          displayName: displayName.trim(),
          email: trimmedEmail,
          password,
          university: university.trim() || undefined,
          program: program.trim() || undefined,
        });
      } catch {
        // Handled by context authError
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail(trimmedEmail, password);
    } catch {
      // Handled by context authError
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = localError || authError;

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

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Toggle color theme"
          >
            {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
          <button
            type="button"
            onClick={() => focusAuthCard('signin')}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => focusAuthCard('signup')}
            className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            Create Account
          </button>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-7xl px-6 py-10 lg:py-14">
        {/* Balanced 2-Column Split Hero + Multi-Email Auth Panel */}
        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12">
          <div className="flex flex-col justify-between gap-7 lg:col-span-6">
            <div className="space-y-5">
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
                className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-slate-100"
                style={{ textWrap: 'balance' }}
              >
                Every course note, past paper, deadline, and study partner in one calm workspace.
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                Built for university students managing heavy coursework. Archive and share past exam questions, upload lecture slides, turn dense readings into active-recall quizzes with AI, track assignments and GPA targets, and message classmates reading the same course.
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-900">
              <img
                src="/src/assets/images/campus_library_hero_1794794846363.jpg"
                alt="University library study tables in morning daylight"
                referrerPolicy="no-referrer"
                className="h-56 w-full object-cover sm:h-64"
              />
            </div>

            <div className="grid grid-cols-3 gap-6 border-t border-slate-200 pt-5 dark:border-slate-800">
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  Courses
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Shared past papers &amp; lecture decks by code
                </p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  AI Lab
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Instant summaries, MCQs &amp; flashcards
                </p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  Real-Time
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Peer discovery &amp; direct resource sharing
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Account Creation & Sign-In Card */}
          <div ref={authCardRef} className="lg:col-span-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
              {mode !== 'reset' ? (
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                      mode === 'signup'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    Create Account
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                      mode === 'signin'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    Sign In
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Reset Your Password
                  </h2>
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    Back to Sign In
                  </button>
                </div>
              )}

              <div className="mt-5">
                <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {mode === 'signup'
                    ? 'Create your student account'
                    : mode === 'signin'
                    ? 'Sign in to your workspace'
                    : 'Recover account access'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {mode === 'signup'
                    ? 'Use any valid email address — university (.edu), Outlook, Yahoo, iCloud, Gmail, Proton, or custom institution domains.'
                    : mode === 'signin'
                    ? 'Sign in with your university or personal email and password, or use Google.'
                    : 'Enter the email address linked to your Scholaryx account and we will send a password reset link.'}
                </p>
              </div>

              {activeError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {activeError}
                </div>
              )}

              {resetSuccess && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{resetSuccess}</span>
                </div>
              )}

              <form onSubmit={handleEmailSubmit} className="mt-5 space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g., Ama Mensah"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email Address (Any Provider)
                  </label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      maxLength={200}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@university.edu, name@outlook.com, or name@yahoo.com"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>

                {mode !== 'reset' && (
                  <div className={mode === 'signup' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : ''}>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Password
                        </label>
                        {mode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => switchMode('reset')}
                            className="text-[11px] font-medium text-blue-700 hover:underline dark:text-blue-400"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative mt-1.5">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3.5 pr-9 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {mode === 'signup' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Confirm Password
                        </label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                    )}
                  </div>
                )}

                {mode === 'signup' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        University (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={150}
                        value={university}
                        onChange={(e) => setUniversity(e.target.value)}
                        placeholder="e.g., University of Ghana"
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Program / Major (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={150}
                        value={program}
                        onChange={(e) => setProgram(e.target.value)}
                        placeholder="e.g., BSc Computer Science"
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || googleSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
                >
                  <span>
                    {submitting
                      ? mode === 'signup'
                        ? 'Creating Account...'
                        : mode === 'signin'
                        ? 'Signing In...'
                        : 'Sending Reset Link...'
                      : mode === 'signup'
                      ? 'Create Account with Email'
                      : mode === 'signin'
                      ? 'Sign In with Email'
                      : 'Send Password Reset Email'}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              {mode !== 'reset' && (
                <>
                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      or continue with
                    </span>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={googleSubmitting || submitting}
                    className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                    <span>{googleSubmitting ? 'Connecting Google...' : 'Continue with Google'}</span>
                  </button>
                </>
              )}
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
          <span>Email &amp; Google Account Sign-In</span>
          <span aria-hidden="true">·</span>
          <span>Real-Time Cloud Sync</span>
        </div>
      </footer>
    </div>
  );
}
