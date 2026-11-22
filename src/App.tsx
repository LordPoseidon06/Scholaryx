import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckSquare,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Sparkles,
  Sun,
  TrendingUp,
  User as UserIcon,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EmailVerificationGate } from './components/EmailVerificationGate';
import { getInitials } from './lib/utils';
import { AIStudyStudioPage } from './pages/AIStudyStudioPage';
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
          <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Something went wrong
            </h2>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
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

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'past-questions', label: 'Past Questions', icon: FileText },
  { id: 'materials', label: 'Study Materials', icon: BookOpen },
  { id: 'ai-studio', label: 'AI Study Studio', icon: Sparkles },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'peers', label: 'Peers & Chat', icon: MessageSquare },
  { id: 'profile', label: 'Profile', icon: UserIcon },
];

function parseInitialResourceParam(): {
  section: NavSection;
  materialId: string | null;
  questionId: string | null;
} {
  if (typeof window === 'undefined') {
    return { section: 'overview', materialId: null, questionId: null };
  }
  const param = new URLSearchParams(window.location.search).get('resource');
  if (!param) {
    return { section: 'overview', materialId: null, questionId: null };
  }
  if (param.startsWith('material:')) {
    const id = param.slice('material:'.length).trim();
    if (id) return { section: 'materials', materialId: id, questionId: null };
  }
  if (param.startsWith('pastQuestion:')) {
    const id = param.slice('pastQuestion:'.length).trim();
    if (id) return { section: 'past-questions', materialId: null, questionId: id };
  }
  return { section: 'overview', materialId: null, questionId: null };
}

function WorkspaceShell() {
  const { user, profile, loading, logout, theme, toggleTheme } = useAuth();
  const [initialRoute] = useState(parseInitialResourceParam);
  const [section, setSection] = useState<NavSection>(initialRoute.section);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [studioPrefill, setStudioPrefill] = useState<StudioPrefill | null>(null);
  const [targetMaterialId, setTargetMaterialId] = useState<string | null>(initialRoute.materialId);
  const [targetQuestionId, setTargetQuestionId] = useState<string | null>(initialRoute.questionId);
  const [targetPeerUid, setTargetPeerUid] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('resource')) {
      params.delete('resource');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700 dark:border-slate-700 dark:border-t-blue-400" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Loading your academic workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingAuth />;
  }

  if (!user.emailVerified) {
    return <EmailVerificationGate />;
  }

  const handleSendToAIStudio = (prefill: StudioPrefill) => {
    setStudioPrefill(prefill);
    setSection('ai-studio');
  };

  const handleMessageAuthor = (authorUid: string) => {
    setTargetPeerUid(authorUid);
    setSection('peers');
  };

  const handleOpenResource = (type: 'material' | 'pastQuestion', resourceId: string) => {
    if (type === 'material') {
      setTargetMaterialId(resourceId);
      setSection('materials');
    } else {
      setTargetQuestionId(resourceId);
      setSection('past-questions');
    }
  };

  const activeNav = NAV_ITEMS.find((n) => n.id === section);

  const renderSection = () => {
    switch (section) {
      case 'overview':
        return <OverviewPage onNavigate={setSection} />;
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
        return <ProgressPage />;
      case 'peers':
        return (
          <PeersChatPage
            initialPeerUid={targetPeerUid}
            onClearInitialPeer={() => setTargetPeerUid(null)}
            onOpenResource={handleOpenResource}
            onNavigate={setSection}
          />
        );
      case 'profile':
        return <ProfilePage />;
      default:
        return <OverviewPage onNavigate={setSection} />;
    }
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <img
            src="/src/assets/images/scholaris_crest_mark_1794794845025.jpg"
            alt="Scholaryx mark"
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-md border border-slate-200 object-cover dark:border-slate-700"
          />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
            Scholaryx
          </span>
        </div>

        <nav className="space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setMobileOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setSection('profile');
            setMobileOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-semibold text-white">
            {getInitials(profile?.displayName || user.displayName || 'ST')}
          </div>
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
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 w-64 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3.5 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-3.5 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Workspace</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {activeNav?.label || 'Overview'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="Toggle color theme"
            >
              {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <WorkspaceShell />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
