import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT_EXPO, ModalShell } from '../components/MotionPrimitives';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString, formatReadableDate, getDaysUntil, getTodayIsoDate, normalizeCourseCode } from '../lib/utils';
import type { CalendarEvent, CalendarEventType } from '../types';

export function CalendarPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate());
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // New event modal
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [eventType, setEventType] = useState<CalendarEventType>('assignment');
  const [date, setDate] = useState(getTodayIsoDate());
  const [startTime, setStartTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'events'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as CalendarEvent))
          .sort((a, b) => a.date.localeCompare(b.date));
        setEvents(docs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/events`)
    );
    return () => unsub();
  }, [user]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !date) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ownerId: user.uid,
        title: clampString(title, 180),
        eventType,
        date,
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (courseCode.trim()) payload.courseCode = normalizeCourseCode(courseCode);
      if (startTime.trim()) payload.startTime = clampString(startTime, 10);
      if (location.trim()) payload.location = clampString(location, 120);
      if (description.trim()) payload.description = clampString(description, 1000);

      await addDoc(collection(db, 'users', user.uid, 'events'), payload);
      setShowAdd(false);
      setTitle('');
      setCourseCode('');
      setStartTime('');
      setLocation('');
      setDescription('');
      setSelectedDate(date);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/events`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCompleted = async (ev: CalendarEvent) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'events', ev.id), {
        completed: !ev.completed,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/events/${ev.id}`);
    }
  };

  const handleDelete = async (ev: CalendarEvent) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'events', ev.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/events/${ev.id}`);
    }
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarCells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < firstDayWeekday; i++) {
    calendarCells.push({ day: null, iso: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({ day: d, iso });
  }

  const filteredEvents = events.filter((ev) => typeFilter === 'ALL' || ev.eventType === typeFilter);
  const eventsByDate = filteredEvents.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});

  const selectedDayEvents = eventsByDate[selectedDate] || [];
  const todayIso = getTodayIsoDate();
  const upcomingExamsAndAssignments = filteredEvents
    .filter((e) => !e.completed && e.date >= todayIso)
    .slice(0, 8);

  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Academic Calendar
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track assignment deadlines, upcoming exam dates, lectures, and planned revision blocks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Events</option>
            <option value="exam">Exams</option>
            <option value="assignment">Assignments</option>
            <option value="lecture">Lectures</option>
            <option value="study_session">Study Sessions</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setDate(selectedDate);
              setShowAdd(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Event
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Month Grid */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between pb-4">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              {monthLabel}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedDate(getTodayIsoDate());
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={monthLabel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
              className="grid grid-cols-7 border-t border-l border-slate-200 text-center text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400"
            >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName) => (
              <div key={dayName} className="border-r border-b border-slate-200 py-2 dark:border-slate-800">
                {dayName}
              </div>
            ))}

            {calendarCells.map((cell, idx) => {
              if (!cell.day || !cell.iso) {
                return (
                  <div
                    key={idx}
                    className="min-h-[84px] border-r border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40"
                  />
                );
              }
              const dayEvents = eventsByDate[cell.iso] || [];
              const isSelected = cell.iso === selectedDate;
              const isToday = cell.iso === todayIso;

              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => setSelectedDate(cell.iso!)}
                  className={`flex min-h-[84px] flex-col items-start border-r border-b border-slate-200 p-2 text-left transition-colors dark:border-slate-800 ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isToday
                        ? 'rounded bg-blue-700 px-1.5 py-0.5 font-semibold text-white'
                        : 'font-medium text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {cell.day}
                  </span>

                  <div className="mt-1.5 w-full space-y-1">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          ev.completed
                            ? 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800'
                            : ev.eventType === 'exam'
                            ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                            : ev.eventType === 'assignment'
                            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}
                      >
                        {ev.courseCode ? `${ev.courseCode} ` : ''}
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="block text-[10px] font-medium text-slate-400">
                        +{dayEvents.length - 2} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Selected Date + Upcoming Exam Queue */}
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Selected Date</p>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  {formatReadableDate(selectedDate)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDate(selectedDate);
                  setShowAdd(true);
                }}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                + Add
              </button>
            </div>

            {selectedDayEvents.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No deadlines or exams on this date.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                {selectedDayEvents.map((ev) => (
                  <div key={ev.id} className="flex items-start justify-between gap-2 py-3">
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleCompleted(ev)}
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          ev.completed
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                        aria-label="Toggle completed"
                      >
                        {ev.completed && <Check className="h-3 w-3" />}
                      </button>
                      <div>
                        <p className={`text-sm font-medium ${ev.completed ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {ev.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {ev.courseCode ? `${ev.courseCode} · ` : ''}
                          {ev.eventType.replace('_', ' ')}
                          {ev.startTime ? ` · ${ev.startTime}` : ''}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(ev)}
                      className="rounded p-1 text-slate-400 hover:text-red-600"
                      aria-label="Delete event"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <CalendarIcon className="h-4 w-4 text-blue-700 dark:text-blue-400" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Upcoming Agenda
              </h3>
            </div>

            {upcomingExamsAndAssignments.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No upcoming exams or assignments.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
                {upcomingExamsAndAssignments.map((ev) => {
                  const days = getDaysUntil(ev.date);
                  return (
                    <div key={ev.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {ev.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ev.courseCode ? `${ev.courseCode} · ` : ''}
                          {formatReadableDate(ev.date)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                          days <= 2
                            ? 'text-red-600 dark:text-red-400'
                            : days <= 7
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {days === 0 ? 'Today' : `${days}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      <ModalShell open={showAdd} onClose={() => setShowAdd(false)} maxWidthClass="max-w-lg">
        <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Schedule Assignment or Exam
              </h2>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. CS301 Midterm Examination"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Event Type
                  </label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as CalendarEventType)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="assignment">Assignment Deadline</option>
                    <option value="exam">Exam Date</option>
                    <option value="lecture">Lecture / Lab</option>
                    <option value="study_session">Study Session</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Course Code
                  </label>
                  <input
                    type="text"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                    placeholder="e.g. CS301"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 uppercase focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Room / Link
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Hall B"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Topics covered, submission portal, allowed materials..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
      </ModalShell>
    </div>
  );
}
