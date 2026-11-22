import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Award, BookOpen, Clock, Plus, Trash2, TrendingUp, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString, formatTimestamp, getTodayIsoDate, normalizeCourseCode } from '../lib/utils';
import type { Enrollment, QuizAttempt, StudyLog } from '../types';

export function ProgressPage() {
  const { user, profile } = useAuth();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);

  // Course modal
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [instructor, setInstructor] = useState('');
  const [credits, setCredits] = useState(3);
  const [targetGrade, setTargetGrade] = useState(85);
  const [currentScore, setCurrentScore] = useState(80);
  const [completedModules, setCompletedModules] = useState(4);
  const [totalModules, setTotalModules] = useState(12);
  const [savingCourse, setSavingCourse] = useState(false);

  // Study log form
  const [logCourse, setLogCourse] = useState('');
  const [logTopic, setLogTopic] = useState('');
  const [logMinutes, setLogMinutes] = useState(45);
  const [logDate, setLogDate] = useState(getTodayIsoDate());
  const [savingLog, setSavingLog] = useState(false);

  useEffect(() => {
    if (profile?.courses?.length && !logCourse) {
      setLogCourse(profile.courses[0]);
    }
  }, [profile, logCourse]);

  useEffect(() => {
    if (!user) return;
    const unsubEnroll = onSnapshot(
      query(collection(db, 'users', user.uid, 'enrollments'), orderBy('createdAt', 'desc')),
      (snap) => setEnrollments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Enrollment))),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/enrollments`)
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'users', user.uid, 'studyLogs'), orderBy('createdAt', 'desc')),
      (snap) => setStudyLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudyLog))),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/studyLogs`)
    );

    const unsubQuizzes = onSnapshot(
      query(collection(db, 'users', user.uid, 'quizAttempts'), orderBy('createdAt', 'desc')),
      (snap) => setQuizAttempts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QuizAttempt))),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/quizAttempts`)
    );

    return () => {
      unsubEnroll();
      unsubLogs();
      unsubQuizzes();
    };
  }, [user]);

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const code = normalizeCourseCode(courseCode);
    if (!code || code.length < 2) return;
    setSavingCourse(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'enrollments'), {
        ownerId: user.uid,
        courseCode: code,
        courseTitle: clampString(courseTitle || code, 150),
        instructor: clampString(instructor, 120),
        credits: Math.min(30, Math.max(0, Number(credits) || 3)),
        targetGrade: Math.min(100, Math.max(0, Number(targetGrade) || 85)),
        currentScore: Math.min(100, Math.max(0, Number(currentScore) || 0)),
        completedModules: Math.max(0, Math.min(200, Math.round(Number(completedModules) || 0))),
        totalModules: Math.max(1, Math.min(200, Math.round(Number(totalModules) || 12))),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowAddCourse(false);
      setCourseCode('');
      setCourseTitle('');
      setInstructor('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/enrollments`);
    } finally {
      setSavingCourse(false);
    }
  };

  const handleIncrementModule = async (en: Enrollment, delta: number) => {
    if (!user) return;
    const next = Math.max(0, Math.min(en.totalModules, en.completedModules + delta));
    try {
      await updateDoc(doc(db, 'users', user.uid, 'enrollments', en.id), {
        completedModules: next,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/enrollments/${en.id}`);
    }
  };

  const handleUpdateScore = async (en: Enrollment, score: number) => {
    if (!user) return;
    const clamped = Math.max(0, Math.min(100, score));
    try {
      await updateDoc(doc(db, 'users', user.uid, 'enrollments', en.id), {
        currentScore: clamped,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/enrollments/${en.id}`);
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'enrollments', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/enrollments/${id}`);
    }
  };

  const handleLogStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const code = normalizeCourseCode(logCourse || 'GENERAL') || 'GENERAL';
    setSavingLog(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'studyLogs'), {
        ownerId: user.uid,
        courseCode: code,
        topic: clampString(logTopic || 'Independent Study', 160),
        durationMinutes: Math.max(1, Math.min(720, Math.round(Number(logMinutes) || 30))),
        loggedDate: logDate || getTodayIsoDate(),
        createdAt: serverTimestamp(),
      });
      setLogTopic('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/studyLogs`);
    } finally {
      setSavingLog(false);
    }
  };

  const totalCredits = enrollments.reduce((acc, e) => acc + (e.credits || 0), 0);
  const weightedAverage =
    totalCredits > 0
      ? enrollments.reduce((acc, e) => acc + e.currentScore * e.credits, 0) / totalCredits
      : 0;
  const avgQuizScore =
    quizAttempts.length > 0
      ? Math.round(quizAttempts.reduce((acc, q) => acc + q.score, 0) / quizAttempts.length)
      : 0;
  const totalMinutesLogged = studyLogs.reduce((acc, l) => acc + l.durationMinutes, 0);

  // Build 7-day study bar chart data
  const last7Days: Array<{ iso: string; label: string; minutes: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    const minutes = studyLogs
      .filter((l) => l.loggedDate === iso)
      .reduce((acc, l) => acc + l.durationMinutes, 0);
    last7Days.push({ iso, label, minutes });
  }
  const maxDayMinutes = Math.max(60, ...last7Days.map((d) => d.minutes));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Academic Progress &amp; Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track course syllabus completion, weighted grade averages, weekly study hours, and AI quiz retention scores.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddCourse(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Track Course
        </button>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Weighted Course Average</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {enrollments.length > 0 ? `${weightedAverage.toFixed(1)}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Across {totalCredits} enrolled credits
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Logged Study Time</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {(totalMinutesLogged / 60).toFixed(1)}h
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {studyLogs.length} recorded study sessions
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">AI Quiz Retention Avg</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {quizAttempts.length > 0 ? `${avgQuizScore}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {quizAttempts.length} completed practice quizzes
          </p>
        </div>
      </div>

      {/* Course Progress Grid */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-700 dark:text-blue-400" />
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Enrolled Courses &amp; Syllabus Mastery
          </h2>
        </div>

        {enrollments.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Add your semester courses to monitor syllabus module completion and grade targets.
            </p>
            <button
              type="button"
              onClick={() => setShowAddCourse(true)}
              className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              Add First Course
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {enrollments.map((en) => {
              const pct = Math.round((en.completedModules / Math.max(1, en.totalModules)) * 100);
              const onTarget = en.currentScore >= en.targetGrade;
              return (
                <div
                  key={en.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                          {en.courseCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{en.credits} credits</span>
                        {en.instructor && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{en.instructor}</span>
                          </>
                        )}
                      </div>
                      <h3 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                        {en.courseTitle}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCourse(en.id)}
                      className="rounded p-1 text-slate-400 hover:text-red-600"
                      aria-label="Remove course"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        Modules completed: <span className="font-mono font-semibold text-slate-800 tabular-nums dark:text-slate-200">{en.completedModules} / {en.totalModules}</span>
                      </span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-700 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleIncrementModule(en, -1)}
                        className="rounded border border-slate-200 px-2 py-1 font-mono text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        -1 Module
                      </button>
                      <button
                        type="button"
                        onClick={() => handleIncrementModule(en, 1)}
                        className="rounded border border-slate-200 px-2 py-1 font-mono text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        +1 Module
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className={onTarget ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-amber-600 dark:text-amber-400'}>
                        Score:
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={en.currentScore}
                        onChange={(e) => handleUpdateScore(en, Number(e.target.value))}
                        className="w-16 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-right font-mono text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950"
                      />
                      <span className="font-mono text-slate-400 tabular-nums">/ {en.targetGrade}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7-Day Study Chart + Manual Study Logger */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
            <TrendingUp className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              7-Day Study Consistency (Minutes)
            </h2>
          </div>

          <div className="mt-6 grid h-44 grid-cols-7 items-end gap-3">
            {last7Days.map((day) => {
              const heightPct = Math.round((day.minutes / maxDayMinutes) * 100);
              return (
                <div key={day.iso} className="flex h-full flex-col items-center justify-end gap-2">
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                    {day.minutes > 0 ? `${day.minutes}m` : '0'}
                  </span>
                  <div className="flex w-full flex-1 items-end justify-center">
                    <div
                      className="w-full max-w-[36px] rounded-t-md bg-blue-700/90 transition-all dark:bg-blue-500"
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
            <Clock className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Log Study Session
            </h2>
          </div>

          <form onSubmit={handleLogStudy} className="mt-4 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Course Code
                </label>
                <input
                  type="text"
                  required
                  value={logCourse}
                  onChange={(e) => setLogCourse(e.target.value.toUpperCase())}
                  placeholder="CS301"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 uppercase focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Minutes
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={720}
                  value={logMinutes}
                  onChange={(e) => setLogMinutes(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Date
              </label>
              <input
                type="date"
                required
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Topic Studied
              </label>
              <input
                type="text"
                value={logTopic}
                onChange={(e) => setLogTopic(e.target.value)}
                placeholder="e.g. Graph Traversal Past Paper"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={savingLog}
              className="w-full rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {savingLog ? 'Logging...' : 'Save Study Log'}
            </button>
          </form>
        </div>
      </div>

      {/* AI Quiz Retention History */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
          <Award className="h-4 w-4 text-blue-700 dark:text-blue-400" />
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            AI Retention Quiz History
          </h2>
        </div>

        {quizAttempts.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Complete a practice quiz in the AI Study Studio to record retention scores here.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-3 font-medium">Quiz Title</th>
                  <th className="py-3 font-medium">Course</th>
                  <th className="py-3 font-medium text-right">Questions</th>
                  <th className="py-3 font-medium text-right">Score</th>
                  <th className="py-3 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {quizAttempts.map((q) => (
                  <tr key={q.id}>
                    <td className="py-3 font-medium text-slate-900 dark:text-slate-100">{q.title}</td>
                    <td className="py-3 font-mono text-slate-600 dark:text-slate-300">{q.courseCode || '—'}</td>
                    <td className="py-3 text-right font-mono tabular-nums">{q.totalQuestions}</td>
                    <td className="py-3 text-right font-mono font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                      {q.score}%
                    </td>
                    <td className="py-3 text-right text-slate-500">{formatTimestamp(q.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Course Modal */}
      {showAddCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Add Tracked Course
              </h2>
              <button
                type="button"
                onClick={() => setShowAddCourse(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddCourse} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Course Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                    placeholder="CS301"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 uppercase focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Credits
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={credits}
                    onChange={(e) => setCredits(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Course Title *
                </label>
                <input
                  type="text"
                  required
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  placeholder="Algorithms & Data Structures"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Instructor (optional)
                </label>
                <input
                  type="text"
                  value={instructor}
                  onChange={(e) => setInstructor(e.target.value)}
                  placeholder="Prof. A. Mensah"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Current Score (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={currentScore}
                    onChange={(e) => setCurrentScore(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Target Grade (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={targetGrade}
                    onChange={(e) => setTargetGrade(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Completed Modules
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={completedModules}
                    onChange={(e) => setCompletedModules(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Total Syllabus Modules
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={totalModules}
                    onChange={(e) => setTotalModules(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddCourse(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCourse}
                  className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {savingCourse ? 'Saving...' : 'Save Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
