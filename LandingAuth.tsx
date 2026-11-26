import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Eye,
  EyeOff,
  FileStack,
  LibraryBig,
  ListChecks,
  Mail,
  MessagesSquare,
  Moon,
  Sun,
  WandSparkles,
} from 'lucide-react';
import { ScholaryxLogo } from '../components/BrandLogo';
import { EASE_OUT_EXPO, SegmentedTabs } from '../components/MotionPrimitives';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'signup' | 'signin' | 'reset';

const LANDING_MODULES = [
  {
    id: 'past-papers',
    icon: FileStack,
    gradient: 'from-amber-500 to-orange-600',
    title: 'Past Questions Archive',
    description:
      'Upload midterms, finals, and worked solutions tagged by course code, semester, and year for peers reading the same course.',
  },
  {
    id: 'ai-studio',
    icon: WandSparkles,
    gradient: 'from-violet-600 to-fuchsia-600',
    title: 'AI Summaries & Retention Quizzes',
    description:
      'Convert uploaded notes, slides, and PDFs into structured revision guides, active-recall flashcards, and graded practice quizzes.',
  },
  {
    id: undefined,
    icon: LibraryBig,
    gradient: 'from-sky-500 to-cyan-600',
    title: 'Shared Notes & Slide Decks',
    description:
      'Publish lecture notes, lab guides, and cheat sheets to your course library and share materials straight into peer conversations.',
  },
  {
    id: 'planning',
    icon: CalendarRange,
    gradient: 'from-rose-500 to-pink-600',
    title: 'Exam & Assignment Calendar',
    description:
      'Track upcoming exam dates, assignment deadlines, lectures, and planned study blocks with live countdown indicators.',
  },
  {
    id: undefined,
    icon: ListChecks,
    gradient: 'from-emerald-500 to-teal-600',
    title: 'Tasks & Study Progress',
    description:
      'Manage coursework priorities across board and list views while tracking course grades, study hours, and quiz retention.',
  },
  {
    id: 'peers',
    icon: MessagesSquare,
    gradient: 'from-indigo-600 to-blue-600',
    title: 'Course Peer Finder & Chat',
    description:
      'Create your student profile, discover classmates enrolled in the same courses, and collaborate in real-time messaging.',
  },
];

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
    <div className="relative min-h-screen bg-workspace-mesh text-slate-900 dark:text-slate-100">
      {/* Subtle Architectural Backdrop */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-academic-grid [mask-image:linear-gradient(to_bottom,black_30%,transparent)]" />

      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-3.5">
          <a href="#top" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <ScholaryxLogo size="sm" />
            <span className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Scholaryx
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#past-papers" className="transition-colors hover:text-indigo-600 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-indigo-300">
              Past Papers
            </a>
            <a href="#ai-studio" className="transition-colors hover:text-indigo-600 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-indigo-300">
              AI Studio
            </a>
            <a href="#planning" className="transition-colors hover:text-indigo-600 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-indigo-300">
              Planning
            </a>
            <a href="#peers" className="transition-colors hover:text-indigo-600 hover:underline underline-offset-4 whitespace-nowrap shrink-0 dark:hover:text-indigo-300">
              Peer Network
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Toggle color theme"
            >
              {theme === 'light' ? <Moon className="h-3.5 w-3.5 text-indigo-600" /> : <Sun className="h-3.5 w-3.5 text-amber-400" />}
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
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:brightness-105 whitespace-nowrap shrink-0"
            >
              Create Account
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="relative z-10 mx-auto max-w-7xl px-6 py-10 lg:py-14">
        {/* Balanced 2-Column Split Hero + Multi-Email Auth Panel */}
        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            className="flex flex-col justify-between gap-7 lg:col-span-6"
          >
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <ScholaryxLogo size="lg" />
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

            <div className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <img
                src="/images/campus_library_hero_1794794846363.jpg"
                alt="University library study tables in morning daylight"
                referrerPolicy="no-referrer"
                className="h-56 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02] sm:h-64"
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
                  Deep summaries, MCQs &amp; flashcards
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
          </motion.div>

          {/* Right Column: Account Creation & Sign-In Card */}
          <motion.div
            ref={authCardRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.06, ease: EASE_OUT_EXPO }}
            className="lg:col-span-6"
          >
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
              {mode !== 'reset' ? (
                <SegmentedTabs
                  layoutGroup="landing-auth-tabs"
                  fullWidth
                  value={mode === 'signup' ? 'signup' : 'signin'}
                  onChange={(next) => switchMode(next)}
                  options={[
                    { id: 'signup', label: 'Create Account' },
                    { id: 'signin', label: 'Sign In' },
                  ]}
                />
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
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  {activeError}
                </motion.div>
              )}

              {resetSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{resetSuccess}</span>
                </motion.div>
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
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 transition-colors focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3.5 text-sm text-slate-900 transition-colors focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3.5 pr-9 text-sm text-slate-900 transition-colors focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
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
                          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 transition-colors focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 transition-colors focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 transition-colors focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || googleSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-all hover:bg-blue-800 active:scale-[0.99] disabled:opacity-60"
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
                    className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
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
          </motion.div>
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
            {LANDING_MODULES.map((mod, idx) => {
              const Icon = mod.icon;
              return (
                <motion.div
                  key={mod.title}
                  id={mod.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.25, delay: idx * 0.04, ease: EASE_OUT_EXPO }}
                  className="rounded-2xl border border-slate-200/90 bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${mod.gradient} text-white shadow-xs`}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    {mod.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {mod.description}
                  </p>
                </motion.div>
              );
            })}
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
