import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  AlertTriangle,
  CalendarRange,
  ChartSpline,
  ExternalLink,
  FileStack,
  GraduationCap,
  LayoutGrid,
  LibraryBig,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  MessagesSquare,
  Moon,
  ShieldCheck,
  Sun,
  WandSparkles,
  X,
} from 'lucide-react';
import { ScholaryxLogo } from './components/BrandLogo';
import { BlockedAccountGate } from './components/BlockedAccountGate';
import { EmailVerificationGate } from './components/EmailVerificationGate';
import { EASE_OUT_EXPO, PageTransition } from './components/MotionPrimitives';
import { UserAvatar } from './components/UserAvatar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FIRESTORE_UPGRADE_URL } from './lib/firebase';
import { AIStudyStudioPage } from './pages/AIStudyStudioPage';
import { AdminPage } from './pages/AdminPage';
import { CalendarPage } from './pages/CalendarPage';
import { LandingAuth } from './pages/LandingAuth';
import { OverviewPage } from './pages/OverviewPage';
import { PastQuestionsPage, type StudioPrefill } from './pages/PastQuestionsPage';
import { PeersChatPage } from './pages/PeersChatPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProgressPage } from './pages/ProgressPage';
import { StudyMaterialsPage } from './pages/StudyMaterialsPage';
import { TasksPage } from './pages/TasksPage';
import type { NavSection } from './types';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
          <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Something went wrong
            </h2>
            <p className="mt-2 break-words text-xs text-slate-600 dark:text-slate-400">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface NavItemConfig {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeGradient: string;
  idleTint: string;
  activeRowBg: string;
  activeText: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    activeGradient: 'from-indigo-600 to-blue-600',
    idleTint: 'text-indigo-600 dark:text-indigo-400',
    activeRowBg: 'bg-indigo-50/90 ring-indigo-200/80 dark:bg-indigo-950/55 dark:ring-indigo-800/60',
    activeText: 'text-indigo-700 dark:text-indigo-300',
  },
  {
    id: 'past-questions',
    label: 'Past Questions',
    icon: FileStack,
    activeGradient: 'from-amber-500 to-orange-600',
    idleTint: 'text-amber-600 dark:text-amber-400',
    activeRowBg: 'bg-amber-50/90 ring-amber-200/80 dark:bg-amber-950/45 dark:ring-amber-800/60',
    activeText: 'text-amber-800 dark:text-amber-300',
  },
  {
    id: 'materials',
    label: 'Study Materials',
    icon: LibraryBig,
    activeGradient: 'from-sky-500 to-cyan-600',
    idleTint: 'text-sky-600 dark:text-sky-400',
    activeRowBg: 'bg-sky-50/90 ring-sky-200/80 dark:bg-sky-950/45 dark:ring-sky-800/60',
    activeText: 'text-sky-800 dark:text-sky-300',
  },
  {
    id: 'ai-studio',
    label: 'AI Study Studio',
    icon: WandSparkles,
    activeGradient: 'from-violet-600 to-fuchsia-600',
    idleTint: 'text-violet-600 dark:text-violet-400',
    activeRowBg: 'bg-violet-50/90 ring-violet-200/80 dark:bg-violet-950/50 dark:ring-violet-800/60',
    activeText: 'text-violet-800 dark:text-violet-300',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: CalendarRange,
    activeGradient: 'from-rose-500 to-pink-600',
    idleTint: 'text-rose-600 dark:text-rose-400',
    activeRowBg: 'bg-rose-50/90 ring-rose-200/80 dark:bg-rose-950/45 dark:ring-rose-800/60',
    activeText: 'text-rose-800 dark:text-rose-300',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: ListChecks,
    activeGradient: 'from-emerald-500 to-teal-600',
    idleTint: 'text-emerald-600 dark:text-emerald-400',
    activeRowBg: 'bg-emerald-50/90 ring-emerald-200/80 dark:bg-emerald-950/45 dark:ring-emerald-800/60',
    activeText: 'text-emerald-800 dark:text-emerald-300',
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: ChartSpline,
    activeGradient: 'from-blue-600 to-cyan-600',
    idleTint: 'text-blue-600 dark:text-blue-400',
    activeRowBg: 'bg-blue-50/90 ring-blue-200/80 dark:bg-blue-950/50 dark:ring-blue-800/60',
    activeText: 'text-blue-800 dark:text-blue-300',
  },
  {
    id: 'peers',
    label: 'Peers & Chat',
    icon: MessagesSquare,
    activeGradient: 'from-teal-500 to-emerald-600',
    idleTint: 'text-teal-600 dark:text-teal-400',
    activeRowBg: 'bg-teal-50/90 ring-teal-200/80 dark:bg-teal-950/45 dark:ring-teal-800/60',
    activeText: 'text-teal-800 dark:text-teal-300',
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: GraduationCap,
    activeGradient: 'from-slate-700 to-indigo-700',
    idleTint: 'text-slate-600 dark:text-slate-400',
    activeRowBg: 'bg-slate-100 ring-slate-300/80 dark:bg-slate-800/90 dark:ring-slate-700',
    activeText: 'text-slate-900 dark:text-slate-100',
  },
  {
    id: 'admin',
    label: 'Admin Control',
    icon: ShieldCheck,
    activeGradient: 'from-rose-600 to-indigo-700',
    idleTint: 'text-rose-600 dark:text-rose-400',
    activeRowBg: 'bg-rose-50/90 ring-rose-200/80 dark:bg-rose-950/45 dark:ring-rose-800/60',
    activeText: 'text-rose-800 dark:text-rose-300',
  },
];

const VALID_SECTIONS = new Set<NavSection>(NAV_ITEMS.map((item) => item.id));

interface WorkspaceRouteState {
  section: NavSection;
  peerUid: string | null;
  materialId: string | null;
  questionId: string | null;
}

function buildHash(state: WorkspaceRouteState): string {
  if (state.section === 'peers' && state.peerUid) {
    return `#peers/${encodeURIComponent(state.peerUid)}`;
  }
  if (state.section === 'materials' && state.materialId) {
    return `#materials/${encodeURIComponent(state.materialId)}`;
  }
  if (state.section === 'past-questions' && state.questionId) {
    return `#past-questions/${encodeURIComponent(state.questionId)}`;
  }
  return `#${state.section}`;
}

function parseRouteFromLocation(): WorkspaceRouteState {
  if (typeof window === 'undefined') {
    return { section: 'overview', peerUid: null, materialId: null, questionId: null };
  }

  const param = new URLSearchParams(window.location.search).get('resource');
  if (param) {
    if (param.startsWith('material:')) {
      const id = param.slice('material:'.length).trim();
      if (id) return { section: 'materials', peerUid: null, materialId: id, questionId: null };
    }
    if (param.startsWith('pastQuestion:')) {
      const id = param.slice('pastQuestion:'.length).trim();
      if (id) return { section: 'past-questions', peerUid: null, materialId: null, questionId: id };
    }
  }

  const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
  if (!rawHash) {
    return { section: 'overview', peerUid: null, materialId: null, questionId: null };
  }

  const [rawSection, ...restParts] = rawHash.split('/');
  const subId = restParts.length > 0 ? decodeURIComponent(restParts.join('/')) : null;
  if (VALID_SECTIONS.has(rawSection as NavSection)) {
    const section = rawSection as NavSection;
    return {
      section,
      peerUid: section === 'peers' ? subId : null,
      materialId: section === 'materials' ? subId : null,
      questionId: section === 'past-questions' ? subId : null,
    };
  }

  return { section: 'overview', peerUid: null, materialId: null, questionId: null };
}

function isWorkspaceRouteState(val: unknown): val is WorkspaceRouteState {
  if (!val || typeof val !== 'object') return false;
  const candidate = val as Partial<WorkspaceRouteState>;
  return typeof candidate.section === 'string' && VALID_SECTIONS.has(candidate.section as NavSection);
}

function WorkspaceShell() {
  const {
    user,
    profile,
    isAdmin,
    blockedRecord,
    platformConfig,
    quotaExceeded,
    dismissQuotaExceeded,
    loading,
    logout,
    theme,
    toggleTheme,
  } = useAuth();
  const [initialRoute] = useState<WorkspaceRouteState>(parseRouteFromLocation);
  const [section, setSection] = useState<NavSection>(initialRoute.section);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [studioPrefill, setStudioPrefill] = useState<StudioPrefill | null>(null);
  const [targetMaterialId, setTargetMaterialId] = useState<string | null>(initialRoute.materialId);
  const [targetQuestionId, setTargetQuestionId] = useState<string | null>(initialRoute.questionId);
  const [targetPeerUid, setTargetPeerUid] = useState<string | null>(initialRoute.peerUid);

  const visibleNavItems = NAV_ITEMS.filter((item) => item.id !== 'admin' || isAdmin);

  const applyRouteState = useCallback(
    (next: WorkspaceRouteState) => {
      const resolvedSection = next.section === 'admin' && !isAdmin ? 'overview' : next.section;
      setSection(resolvedSection);
      setTargetPeerUid(resolvedSection === 'peers' ? next.peerUid : null);
      setTargetMaterialId(resolvedSection === 'materials' ? next.materialId : null);
      setTargetQuestionId(resolvedSection === 'past-questions' ? next.questionId : null);
      setMobileOpen(false);
    },
    [isAdmin]
  );

  const navigateTo = useCallback(
    (
      nextSection: NavSection,
      opts?: {
        peerUid?: string | null;
        materialId?: string | null;
        questionId?: string | null;
        replace?: boolean;
      }
    ) => {
      const resolvedSection = nextSection === 'admin' && !isAdmin ? 'overview' : nextSection;
      const nextState: WorkspaceRouteState = {
        section: resolvedSection,
        peerUid: resolvedSection === 'peers' ? (opts?.peerUid ?? null) : null,
        materialId: resolvedSection === 'materials' ? (opts?.materialId ?? null) : null,
        questionId: resolvedSection === 'past-questions' ? (opts?.questionId ?? null) : null,
      };

      const isSame =
        section === nextState.section &&
        targetPeerUid === nextState.peerUid &&
        targetMaterialId === nextState.materialId &&
        targetQuestionId === nextState.questionId;

      applyRouteState(nextState);

      if (typeof window !== 'undefined' && !isSame) {
        const nextUrl = `${window.location.pathname}${window.location.search}${buildHash(nextState)}`;
        if (opts?.replace) {
          window.history.replaceState(nextState, '', nextUrl);
        } else {
          window.history.pushState(nextState, '', nextUrl);
        }
      }
    },
    [section, targetPeerUid, targetMaterialId, targetQuestionId, applyRouteState, isAdmin]
  );

  useEffect(() => {
    if (!loading && section === 'admin' && !isAdmin) {
      navigateTo('overview', { replace: true });
    }
  }, [loading, section, isAdmin, navigateTo]);

  // Clean ?resource query param on boot & ensure initial history entry has state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('resource')) {
      params.delete('resource');
    }
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${buildHash(initialRoute)}`;
    window.history.replaceState(initialRoute, '', nextUrl);
  }, [initialRoute]);

  // Sync browser Back / Forward buttons cleanly to the workspace history stack
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = (event: PopStateEvent) => {
      const next = isWorkspaceRouteState(event.state) ? event.state : parseRouteFromLocation();
      applyRouteState(next);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyRouteState]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-workspace-mesh">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
          className="space-y-3 text-center"
        >
          <div className="mx-auto flex justify-center">
            <ScholaryxLogo size="lg" />
          </div>
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-700 dark:border-t-indigo-400" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Loading your academic workspace...
          </p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <LandingAuth />;
  }

  if (!user.emailVerified) {
    return <EmailVerificationGate />;
  }

  if (blockedRecord && !isAdmin) {
    return <BlockedAccountGate />;
  }

  const handleSendToAIStudio = (prefill: StudioPrefill) => {
    setStudioPrefill(prefill);
    navigateTo('ai-studio');
  };

  const handleMessageAuthor = (authorUid: string) => {
    navigateTo('peers', { peerUid: authorUid });
  };

  const handleOpenResource = (type: 'material' | 'pastQuestion', resourceId: string) => {
    if (type === 'material') {
      navigateTo('materials', { materialId: resourceId });
    } else {
      navigateTo('past-questions', { questionId: resourceId });
    }
  };

  const activeNav = visibleNavItems.find((n) => n.id === section) || visibleNavItems[0];
  const ActiveNavIcon = activeNav.icon;

  const renderSection = () => {
    switch (section) {
      case 'overview':
        return <OverviewPage onNavigate={(s) => navigateTo(s)} />;
      case 'past-questions':
        return (
          <PastQuestionsPage
            initialQuestionId={targetQuestionId}
            onClearInitialQuestion={() => setTargetQuestionId(null)}
            onMessageAuthor={handleMessageAuthor}
            onSendToAIStudio={handleSendToAIStudio}
          />
        );
      case 'materials':
        return (
          <StudyMaterialsPage
            initialMaterialId={targetMaterialId}
            onClearInitialMaterial={() => setTargetMaterialId(null)}
            onMessageAuthor={handleMessageAuthor}
            onSendToAIStudio={handleSendToAIStudio}
          />
        );
      case 'ai-studio':
        return (
          <AIStudyStudioPage
            prefill={studioPrefill}
            onClearPrefill={() => setStudioPrefill(null)}
          />
        );
      case 'calendar':
        return <CalendarPage />;
      case 'tasks':
        return <TasksPage />;
      case 'progress':
        return (
          <ProgressPage
            onReviewQuiz={(attempt) =>
              handleSendToAIStudio({
                title: attempt.title,
                courseCode: attempt.courseCode || '',
                contentText: '',
                initialMode: 'quiz',
                savedQuiz: attempt,
              })
            }
          />
        );
      case 'peers':
        return (
          <PeersChatPage
            activePeerUid={targetPeerUid}
            onSelectPeerUid={(uid) => navigateTo('peers', { peerUid: uid })}
            onOpenResource={handleOpenResource}
            onNavigate={(s) => navigateTo(s)}
          />
        );
      case 'profile':
        return <ProfilePage />;
      case 'admin':
        return isAdmin ? <AdminPage /> : <OverviewPage onNavigate={(s) => navigateTo(s)} />;
      default:
        return <OverviewPage onNavigate={(s) => navigateTo(s)} />;
    }
  };

  const renderSidebarContent = (layoutIdSuffix: string) => (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800/80">
          <ScholaryxLogo size="md" />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
            Scholaryx
          </span>
        </div>

        <nav className="space-y-1 px-3 py-4" aria-label="Workspace Navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? item.activeText
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId={`nav-active-${layoutIdSuffix}`}
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className={`absolute inset-0 rounded-xl ring-1 ${item.activeRowBg}`}
                  />
                )}
                <span
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 ${
                    active
                      ? `bg-gradient-to-br ${item.activeGradient} text-white shadow-xs`
                      : `bg-slate-100/90 ${item.idleTint} group-hover:bg-white dark:bg-slate-800/90 dark:group-hover:bg-slate-800`
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="relative z-10 font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200/80 p-4 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => navigateTo('profile')}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <UserAvatar
            name={profile?.displayName || user.displayName || 'ST'}
            photoURL={profile?.photoURL || user.photoURL}
            size="sm"
            variant="blue"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {profile?.displayName || user.displayName}
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {profile?.program || 'Student'}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-workspace-mesh text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200/80 bg-white/90 backdrop-blur-md lg:block dark:border-slate-800/80 dark:bg-slate-900/90">
        <div className="sticky top-0 h-screen">
          {renderSidebarContent('desktop')}
        </div>
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -264 }}
              animate={{ x: 0 }}
              exit={{ x: -264 }}
              transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
              className="relative z-10 w-64 bg-white shadow-xl dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
              {renderSidebarContent('mobile')}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/85 px-4 py-2.5 lg:py-3 backdrop-blur-md sm:px-6 dark:border-slate-800/80 dark:bg-slate-900/85">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 items-center gap-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${activeNav.activeGradient} text-white shadow-2xs`}
              >
                <ActiveNavIcon className="h-3.5 w-3.5" />
              </span>
              <span className="hidden sm:inline">Workspace</span>
              <span className="hidden text-slate-300 sm:inline dark:text-slate-700">/</span>
              <span className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                {activeNav.label}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {isAdmin && section !== 'admin' && (
              <button
                type="button"
                onClick={() => navigateTo('admin')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-all hover:border-rose-300 hover:bg-rose-100 whitespace-nowrap dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/50"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                <span className="hidden sm:inline">Admin</span>
              </button>
            )}

            {section !== 'peers' && (
              <button
                type="button"
                onClick={() => navigateTo('peers')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:border-teal-300 hover:bg-teal-50/70 hover:text-teal-700 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:bg-teal-950/50 dark:hover:text-teal-300"
              >
                <MessagesSquare className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                <span className="hidden sm:inline">Messages</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="Toggle color theme"
            >
              {theme === 'light' ? (
                <Moon className="h-3.5 w-3.5 text-indigo-600" />
              ) : (
                <Sun className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span className="hidden sm:inline">{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
          </div>
        </header>

        <main
          className={`mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8 ${
            !(section === 'peers' && Boolean(targetPeerUid)) ? 'pb-16 lg:pb-8' : ''
          }`}
        >
          {quotaExceeded && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/95 px-4 py-3 text-xs text-amber-950 shadow-2xs dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-display text-xs font-bold">
                  Daily Database Read Limit Reached
                </p>
                <p className="leading-relaxed opacity-90">
                  Firestore has reached its free daily read unit limit for today. Cached study materials remain visible, and the free daily quota resets tomorrow.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-0.5">
                  <a
                    href={FIRESTORE_UPGRADE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-amber-900 underline decoration-amber-500/70 underline-offset-2 hover:text-amber-700 dark:text-amber-200 dark:hover:text-amber-100"
                  >
                    <span>Upgrade Database Plan</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href="https://firebase.google.com/pricing#cloud-firestore"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-amber-800 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100"
                  >
                    <span>View Spark Enterprise Quotas</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissQuotaExceeded}
                className="rounded-lg p-1 text-amber-700 transition-colors hover:bg-amber-200/60 dark:text-amber-300 dark:hover:bg-amber-900/50"
                aria-label="Dismiss quota notice"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {platformConfig?.isActive &&
            (platformConfig.announcementTitle || platformConfig.announcementBody) && (
              <div
                className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs ${
                  platformConfig.announcementTone === 'warning'
                    ? 'border-amber-200 bg-amber-50/90 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-200'
                    : platformConfig.announcementTone === 'success'
                    ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-200'
                    : 'border-indigo-200 bg-indigo-50/90 text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/35 dark:text-indigo-200'
                }`}
              >
                <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  {platformConfig.announcementTitle && (
                    <p className="font-display text-xs font-bold">{platformConfig.announcementTitle}</p>
                  )}
                  {platformConfig.announcementBody && (
                    <p className="mt-0.5 leading-relaxed opacity-90">{platformConfig.announcementBody}</p>
                  )}
                </div>
              </div>
            )}

          <PageTransition sectionKey={section}>
            {renderSection()}
          </PageTransition>
        </main>

        {/* Compact Mobile Bottom Quick-Nav (hidden inside active DM conversations to preserve message composer space) */}
        {!(section === 'peers' && Boolean(targetPeerUid)) && (
          <nav
            aria-label="Mobile Quick Navigation"
            className="fixed inset-x-0 bottom-0 z-30 flex h-12 items-center justify-around border-t border-slate-200/90 bg-white/95 px-2 backdrop-blur-md lg:hidden dark:border-slate-800/90 dark:bg-slate-900/95"
          >
            {(
              [
                { id: 'overview', label: 'Home', icon: LayoutGrid },
                { id: 'materials', label: 'Materials', icon: LibraryBig },
                { id: 'ai-studio', label: 'AI Studio', icon: WandSparkles },
                { id: 'peers', label: 'Chats', icon: MessagesSquare },
                { id: 'profile', label: 'Profile', icon: GraduationCap },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  className={`flex min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppErrorBoundary>
        <AuthProvider>
          <WorkspaceShell />
        </AuthProvider>
      </AppErrorBoundary>
    </MotionConfig>
  );
}
