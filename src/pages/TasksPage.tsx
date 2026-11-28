import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { CheckCircle2, Plus, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_OUT_EXPO, ModalShell, SegmentedTabs } from '../components/MotionPrimitives';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, handleSnapshotError, OperationType } from '../lib/firebase';
import { clampString, formatReadableDate, getTimestampMillis, getTodayIsoDate, normalizeCourseCode } from '../lib/utils';
import type { StudyTask, TaskPriority, TaskStatus } from '../types';

export function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [courseFilter, setCourseFilter] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState(getTodayIsoDate());
  const [estimatedMinutes, setEstimatedMinutes] = useState(45);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'tasks'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as StudyTask))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setTasks(docs);
      },
      (err) => handleSnapshotError(err, OperationType.LIST, `users/${user.uid}/tasks`)
    );
    return () => unsub();
  }, [user]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ownerId: user.uid,
        title: clampString(title, 200),
        priority,
        status: 'todo',
        estimatedMinutes: Math.max(0, Math.min(2000, Number(estimatedMinutes) || 0)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (courseCode.trim()) payload.courseCode = normalizeCourseCode(courseCode);
      if (dueDate) payload.dueDate = dueDate;
      if (notes.trim()) payload.notes = clampString(notes, 1500);

      await addDoc(collection(db, 'users', user.uid, 'tasks'), payload);
      setShowModal(false);
      setTitle('');
      setCourseCode('');
      setNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/tasks`);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (task: StudyTask, nextStatus: TaskStatus) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/tasks/${task.id}`);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'tasks', taskId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/tasks/${taskId}`);
    }
  };

  const filtered = tasks.filter((t) => {
    if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
    if (courseFilter.trim()) {
      const s = courseFilter.trim().toLowerCase();
      if (!(t.courseCode || '').toLowerCase().includes(s) && !t.title.toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });

  const columns: Array<{ status: TaskStatus; label: string }> = [
    { status: 'todo', label: 'To Do' },
    { status: 'in_progress', label: 'In Progress' },
    { status: 'done', label: 'Completed' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Tasks &amp; Study Queue
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Plan readings, problem sets, lab reports, and exam revision checkpoints.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          New Study Task
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedTabs
          layoutGroup="tasks-view-mode"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { id: 'board', label: 'Board View' },
            { id: 'table', label: 'Table View' },
          ]}
        />

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            placeholder="Filter by course or keyword..."
            className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      {viewMode === 'board' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {columns.map((col) => {
            const colTasks = filtered.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className="rounded-xl border border-slate-200 bg-slate-100/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <div className="flex items-center justify-between pb-3">
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {col.label}
                  </h2>
                  <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {colTasks.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">No tasks</p>
                  ) : (
                    colTasks.map((task) => (
                      <motion.div
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                        className="rounded-lg border border-slate-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono font-medium text-blue-700 dark:text-blue-400">
                            {task.courseCode || 'General'}
                          </span>
                          <span
                            className={`font-medium ${
                              task.priority === 'high'
                                ? 'text-red-600 dark:text-red-400'
                                : task.priority === 'medium'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {task.priority} priority
                          </span>
                        </div>

                        <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {task.title}
                        </p>
                        {task.notes && (
                          <p className="mt-1 text-xs text-slate-500 line-clamp-2 dark:text-slate-400">
                            {task.notes}
                          </p>
                        )}

                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
                          <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
                            {task.dueDate ? formatReadableDate(task.dueDate) : 'No due date'}
                            {task.estimatedMinutes ? ` · ${task.estimatedMinutes}m` : ''}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={task.status}
                              onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                              className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              aria-label="Task status"
                            >
                              <option value="todo">To Do</option>
                              <option value="in_progress">In Progress</option>
                              <option value="done">Done</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleDelete(task.id)}
                              className="rounded p-1 text-slate-400 hover:text-red-600"
                              aria-label="Delete task"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
                <th className="px-4 py-3 font-medium text-right">Est. Time</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No tasks found.
                  </td>
                </tr>
              ) : (
                filtered.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {task.title}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                      {task.courseCode || '—'}
                    </td>
                    <td className="px-4 py-3 capitalize">{task.priority}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {task.dueDate ? formatReadableDate(task.dueDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {task.estimatedMinutes ? `${task.estimatedMinutes}m` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(task.id)}
                        className="rounded p-1 text-slate-400 hover:text-red-600"
                        aria-label="Delete task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New Task Modal */}
      <ModalShell open={showModal} onClose={() => setShowModal(false)} maxWidthClass="max-w-md">
        <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Add Study Task
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Complete Chapter 5 Problem Set"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Course Code
                  </label>
                  <input
                    type="text"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                    placeholder="e.g. MATH204"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 uppercase focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Est. Minutes
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    value={estimatedMinutes}
                    onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Pages, rubric checklist, or group member responsibilities..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving ? 'Adding...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
      </ModalShell>
    </div>
  );
}
