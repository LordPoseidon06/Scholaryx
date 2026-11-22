import React, { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { ArrowRight, BookOpen, Calendar as CalendarIcon, CheckCircle2, Clock, FileText, Pause, Play, RotateCcw, Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatReadableDate, getDaysUntil, getTimestampMillis, getTodayIsoDate } from '../lib/utils';
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
      query(collection(db, 'users', user.uid, 'tasks'), orderBy('createdAt', 'desc')),
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudyTask))),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/tasks`)
    );

    const unsubEvents = onSnapshot(
      query(collection(db, 'users', user.uid, 'events'), orderBy('date', 'asc')),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent))),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/events`)
    );

    const unsubEnrollments = onSnapshot(
      query(collection(db, 'users', user.uid, 'enrollments'), orderBy('createdAt', 'desc')),
      (snap) => setEnrollments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Enrollment))),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/enrollments`)
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'users', user.uid, 'studyLogs'), orderBy('createdAt', 'desc')),
      (snap) => setStudyLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudyLog))),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/studyLogs`)
    );

    const unsubMaterials = onSnapshot(
      query(collection(db, 'studyMaterials'), where('visibility', 'in', ['course', 'public'])),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as StudyMaterial))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setMaterials(docs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studyMaterials')
    );

    const unsubQuestions = onSnapshot(
      query(collection(db, 'pastQuestions'), where('isPublic', '==', true)),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PastQuestion))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setPastQuestions(docs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pastQuestions')
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
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
            Welcome back, {profile?.displayName || user?.displayName || 'Student'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {profile?.university || 'University'} · {profile?.program || 'Student'} · {profile?.yearOfStudy || 'Academic Term'}
            {myCourses.length > 0 ? ` · ${myCourses.join(', ')}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {myCourses.length === 0 && (
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 whitespace-nowrap dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
            >
              Add Your Courses
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('ai-studio')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Open AI Study Studio
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigate('tasks')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Study Tasks</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {tasks.filter((t) => t.status !== 'done').length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {tasks.filter((t) => t.status === 'done').length} completed
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('calendar')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Upcoming Exams &amp; Deadlines</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {upcomingEvents.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {upcomingEvents[0] ? `Next: ${formatReadableDate(upcomingEvents[0].date)}` : 'No pending dates'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('past-questions')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Course Past Papers</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {pastQuestions.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {materials.length} shared study materials
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('progress')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Logged Study Time</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {(totalStudyMinutes / 60).toFixed(1)}h
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {enrollments.length} tracked courses
          </p>
        </button>
      </div>

      {/* Main 2-Column Workspace Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Upcoming Deadlines + Active Tasks */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Upcoming Assignments &amp; Exams
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('calendar')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
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

          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Priority Tasks
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
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
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Study Focus Timer
                </h2>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {[25, 50].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setTimerRunning(false);
                      setFocusMinutes(mins);
                      setSecondsLeft(mins * 60);
                    }}
                    className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium tabular-nums transition-colors ${
                      focusMinutes === mins
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="py-6 text-center">
              <div className="font-mono text-5xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                {mm}:{ss}
              </div>

              <div className="mt-4">
                <input
                  type="text"
                  value={focusCourse}
                  onChange={(e) => setFocusCourse(e.target.value.toUpperCase())}
                  placeholder="Course Code (e.g. CS301)"
                  className="w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-center font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setTimerRunning((r) => !r)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
                <button
                  type="button"
                  disabled={loggingSession}
                  onClick={handleLogFocusSession}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  {loggingSession ? 'Saving...' : 'Log Session'}
                </button>
              </div>
              {logNotice && (
                <p className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">{logNotice}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Course Materials Feed
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('materials')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
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
                    className="flex w-full items-center justify-between gap-3 py-3 text-left hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {mat.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {mat.courseCode} · {mat.materialType} · By {mat.authorName}
                      </p>
                    </div>
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
