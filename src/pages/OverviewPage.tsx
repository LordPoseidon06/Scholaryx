import React, { useEffect, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import {
  ArrowRight,
  CalendarRange,
  ChartSpline,
  Clock,
  FileStack,
  LibraryBig,
  ListChecks,
  Pause,
  Play,
  RotateCcw,
  WandSparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { LecturerAcknowledgement } from '../components/LecturerAcknowledgement';
import { EASE_OUT_EXPO, SegmentedTabs } from '../components/MotionPrimitives';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, handleSnapshotError, OperationType } from '../lib/firebase';
import { computeStudyStreak, formatReadableDate, getDaysUntil, getTimestampMillis, getTodayIsoDate } from '../lib/utils';
import type { CalendarEvent, Enrollment, NavSection, PastQuestion, StudyLog, StudyMaterial, StudyTask } from '../types';

interface OverviewPageProps {
  onNavigate: (section: NavSection) => void;
}

export function OverviewPage({ onNavigate }: OverviewPageProps) {
  const { user, profile } = useAuth();
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [pastQuestions, setPastQuestions] = useState<PastQuestion[]>([]);
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);

  // Built-in Pomodoro Focus Timer
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [focusCourse, setFocusCourse] = useState('');
  const [loggingSession, setLoggingSession] = useState(false);
  const [logNotice, setLogNotice] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.courses?.length && !focusCourse) {
      setFocusCourse(profile.courses[0]);
    }
  }, [profile, focusCourse]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    if (!user) return;

    const unsubTasks = onSnapshot(
      query(collection(db, 'users', user.uid, 'tasks'), where('ownerId', '==', user.uid)),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as StudyTask))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setTasks(docs);
      },
      (err) => handleSnapshotError(err, OperationType.LIST, `users/${user.uid}/tasks`)
    );

    const unsubEvents = onSnapshot(
      query(collection(db, 'users', user.uid, 'events'), where('ownerId', '==', user.uid)),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as CalendarEvent))
          .sort((a, b) => a.date.localeCompare(b.date));
        setEvents(docs);
      },
      (err) => handleSnapshotError(err, OperationType.LIST, `users/${user.uid}/events`)
    );

    const unsubEnrollments = onSnapshot(
      query(collection(db, 'users', user.uid, 'enrollments'), where('ownerId', '==', user.uid)),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Enrollment))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setEnrollments(docs);
      },
      (err) => handleSnapshotError(err, OperationType.LIST, `users/${user.uid}/enrollments`)
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'users', user.uid, 'studyLogs'), where('ownerId', '==', user.uid)),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as StudyLog))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setStudyLogs(docs);
      },
      (err) => handleSnapshotError(err, OperationType.LIST, `users/${user.uid}/studyLogs`)
    );

    const unsubMaterials = onSnapshot(
      query(collection(db, 'studyMaterials'), where('visibility', 'in', ['course', 'public']), limit(60)),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as StudyMaterial))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setMaterials(docs);
      },
      (err) => handleSnapshotError(err, OperationType.LIST, 'studyMaterials')
    );

    const unsubQuestions = onSnapshot(
      query(collection(db, 'pastQuestions'), where('isPublic', '==', true), limit(60)),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PastQuestion))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setPastQuestions(docs);
      },
      (err) => handleSnapshotError(err, OperationType.LIST, 'pastQuestions')
    );

    return () => {
      unsubTasks();
      unsubEvents();
      unsubEnrollments();
      unsubLogs();
      unsubMaterials();
      unsubQuestions();
    };
  }, [user]);

  const handleLogFocusSession = async () => {
    if (!user) return;
    const elapsedMinutes = Math.max(1, Math.round((focusMinutes * 60 - secondsLeft) / 60) || focusMinutes);
    setLoggingSession(true);
    setLogNotice(null);
    try {
      await addDoc(collection(db, 'users', user.uid, 'studyLogs'), {
        ownerId: user.uid,
        courseCode: (focusCourse || profile?.courses[0] || 'GENERAL').toUpperCase().slice(0, 24),
        topic: 'Focused Pomodoro Study',
        durationMinutes: Math.min(720, elapsedMinutes),
        loggedDate: getTodayIsoDate(),
        createdAt: serverTimestamp(),
      });
      setLogNotice(`Logged ${elapsedMinutes} min study session.`);
      setTimerRunning(false);
      setSecondsLeft(focusMinutes * 60);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/studyLogs`);
    } finally {
      setLoggingSession(false);
    }
  };

  const todayIso = getTodayIsoDate();
  const upcomingEvents = events.filter((e) => !e.completed && e.date >= todayIso).slice(0, 5);
  const openTasks = tasks.filter((t) => t.status !== 'done').slice(0, 5);
  const myCourses = profile?.courses || [];
  const relevantMaterials = materials
    .filter((m) => myCourses.length === 0 || myCourses.includes(m.courseCode))
    .slice(0, 4);

  const totalStudyMinutes = studyLogs.reduce((acc, log) => acc + (log.durationMinutes || 0), 0);
  const todayStudyMinutes = studyLogs
    .filter((log) => log.loggedDate === todayIso)
    .reduce((acc, log) => acc + (log.durationMinutes || 0), 0);
  const studyStreak = computeStudyStreak(studyLogs.map((l) => l.loggedDate));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const totalFocusSeconds = focusMinutes * 60;
  const focusProgress = totalFocusSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalFocusSeconds)) : 0;
  const ringRadius = 64;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - focusProgress);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/90 via-white to-sky-50/80 p-6 shadow-xs dark:border-indigo-900/50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-sky-950/30">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
              Welcome back, {profile?.displayName || user?.displayName || 'Student'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              {profile?.university || 'University'} · {profile?.program || 'Student'} · {profile?.yearOfStudy || 'Academic Term'}
              {myCourses.length > 0 ? ` · ${myCourses.join(', ')}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {myCourses.length === 0 && (
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 whitespace-nowrap dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
              >
                Add Your Courses
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('ai-studio')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.98] whitespace-nowrap"
            >
              <WandSparkles className="h-3.5 w-3.5" />
              Open AI Study Studio
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            key: 'tasks',
            nav: 'tasks' as NavSection,
            icon: ListChecks,
            iconGradient: 'from-emerald-500 to-teal-600',
            hoverRing: 'hover:border-emerald-300 dark:hover:border-emerald-700/80',
            valueHover: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400',
            label: 'Active Study Tasks',
            value: String(tasks.filter((t) => t.status !== 'done').length),
            sub: `${tasks.filter((t) => t.status === 'done').length} completed`,
          },
          {
            key: 'calendar',
            nav: 'calendar' as NavSection,
            icon: CalendarRange,
            iconGradient: 'from-rose-500 to-pink-600',
            hoverRing: 'hover:border-rose-300 dark:hover:border-rose-700/80',
            valueHover: 'group-hover:text-rose-600 dark:group-hover:text-rose-400',
            label: 'Upcoming Exams & Deadlines',
            value: String(upcomingEvents.length),
            sub: upcomingEvents[0] ? `Next: ${formatReadableDate(upcomingEvents[0].date)}` : 'No pending dates',
          },
          {
            key: 'past-questions',
            nav: 'past-questions' as NavSection,
            icon: FileStack,
            iconGradient: 'from-amber-500 to-orange-600',
            hoverRing: 'hover:border-amber-300 dark:hover:border-amber-700/80',
            valueHover: 'group-hover:text-amber-600 dark:group-hover:text-amber-400',
            label: 'Course Past Papers',
            value: String(pastQuestions.length),
            sub: `${materials.length} shared study materials`,
          },
          {
            key: 'progress',
            nav: 'progress' as NavSection,
            icon: ChartSpline,
            iconGradient: 'from-indigo-600 to-blue-600',
            hoverRing: 'hover:border-indigo-300 dark:hover:border-indigo-700/80',
            valueHover: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
            label: 'Logged Study Time',
            value: `${(totalStudyMinutes / 60).toFixed(1)}h`,
            sub: `${studyStreak > 0 ? `${studyStreak}-day streak · ` : ''}${todayStudyMinutes}m today`,
          },
        ].map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <motion.button
              key={kpi.key}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: idx * 0.04, ease: EASE_OUT_EXPO }}
              onClick={() => onNavigate(kpi.nav)}
              className={`group rounded-2xl border border-slate-200/90 bg-white p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${kpi.hoverRing}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{kpi.label}</p>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${kpi.iconGradient} text-white shadow-2xs transition-transform duration-200 group-hover:scale-105`}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className={`mt-2.5 font-mono text-3xl font-bold text-slate-900 tabular-nums transition-colors dark:text-slate-100 ${kpi.valueHover}`}>
                {kpi.value}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{kpi.sub}</p>
            </motion.button>
          );
        })}
      </div>

      {/* Main 2-Column Workspace Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Upcoming Deadlines + Active Tasks */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                  <CalendarRange className="h-4 w-4" />
                </span>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Upcoming Assignments &amp; Exams
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('calendar')}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Full Calendar
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming assignments or exams scheduled.</p>
                <button
                  type="button"
                  onClick={() => onNavigate('calendar')}
                  className="mt-3 rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Schedule Exam or Assignment
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {upcomingEvents.map((ev) => {
                  const days = getDaysUntil(ev.date);
                  return (
                    <div key={ev.id} className="flex items-center justify-between gap-4 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {ev.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {ev.courseCode ? `${ev.courseCode} · ` : ''}
                          {ev.eventType.replace('_', ' ')} · {formatReadableDate(ev.date)}
                          {ev.startTime ? ` at ${ev.startTime}` : ''}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                          days <= 2
                            ? 'text-red-600 dark:text-red-400'
                            : days <= 7
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <ListChecks className="h-4 w-4" />
                </span>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Priority Tasks
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Manage Tasks
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {openTasks.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">Your task queue is clear.</p>
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="mt-3 rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Create Study Task
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {openTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {task.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {task.courseCode ? `${task.courseCode} · ` : ''}
                        Priority: {task.priority}
                        {task.dueDate ? ` · Due ${formatReadableDate(task.dueDate)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {task.status === 'in_progress' ? 'In Progress' : 'To Do'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Focus Timer + Recent Course Materials */}
        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                  <Clock className="h-4 w-4" />
                </span>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Study Focus Timer
                </h2>
              </div>
              <SegmentedTabs
                layoutGroup="overview-focus-preset"
                size="xs"
                value={String(focusMinutes) as '25' | '50'}
                onChange={(val) => {
                  const mins = Number(val);
                  setTimerRunning(false);
                  setFocusMinutes(mins);
                  setSecondsLeft(mins * 60);
                }}
                options={[
                  { id: '25', label: '25m' },
                  { id: '50', label: '50m' },
                ]}
              />
            </div>

            <div className="py-6 text-center">
              <div className="relative mx-auto flex h-40 w-40 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 148 148" aria-hidden="true">
                  <defs>
                    <linearGradient id="focusRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="50%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="74"
                    cy="74"
                    r={ringRadius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="7"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  <motion.circle
                    cx="74"
                    cy="74"
                    r={ringRadius}
                    fill="none"
                    stroke="url(#focusRingGradient)"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    animate={{ strokeDashoffset: ringDashOffset }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-4xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                    {mm}:{ss}
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {timerRunning ? 'Focusing' : secondsLeft === 0 ? 'Complete' : 'Ready'}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                <input
                  type="text"
                  value={focusCourse}
                  onChange={(e) => setFocusCourse(e.target.value.toUpperCase())}
                  placeholder="Course Code (e.g. CS301)"
                  className="w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-center font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                {myCourses.length > 0 && (
                  <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                    {myCourses.slice(0, 5).map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setFocusCourse(code)}
                        className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                          focusCourse === code
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setTimerRunning((r) => !r)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:brightness-105 active:scale-[0.98] whitespace-nowrap"
                >
                  {timerRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {timerRunning ? 'Pause' : 'Start Focus'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimerRunning(false);
                    setSecondsLeft(focusMinutes * 60);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
                <button
                  type="button"
                  disabled={loggingSession}
                  onClick={handleLogFocusSession}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ChartSpline className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  {loggingSession ? 'Saving...' : 'Log Session'}
                </button>
              </div>
              {logNotice && (
                <p className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">{logNotice}</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                  <LibraryBig className="h-4 w-4" />
                </span>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Course Materials Feed
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('materials')}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Browse All
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {relevantMaterials.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No notes or slides uploaded yet for your courses.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('materials')}
                  className="mt-3 rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Upload Study Material
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {relevantMaterials.map((mat) => (
                  <button
                    key={mat.id}
                    type="button"
                    onClick={() => onNavigate('materials')}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {mat.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {mat.courseCode} · {mat.materialType} · By {mat.authorName}
                      </p>
                    </div>
                    <FileStack className="h-4 w-4 shrink-0 text-sky-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <LecturerAcknowledgement variant="compact" />
    </div>
  );
}
