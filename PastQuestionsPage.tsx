import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { Check, Download, FileText, MessageSquare, Plus, Search, Share2, Sparkles, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { MarkdownView } from '../components/MarkdownView';
import { AiErrorBanner, ModalShell, SegmentedTabs } from '../components/MotionPrimitives';
import { ShareToPeerModal } from '../components/ShareToPeerModal';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { deleteFileChunks, loadAttachmentDataUrl, splitDataUrlIntoChunks, uploadFileChunks } from '../lib/fileChunks';
import { downloadNotesAsHtml, downloadNotesAsMarkdown } from '../lib/notesExport';
import { clampString, formatFileSize, formatTimestamp, getTimestampMillis, MAX_INLINE_DATA_URL_CHARS, normalizeCourseCode, parseAiResponse, readStudyFile } from '../lib/utils';
import type { ExamTypeOption, PastQuestion, PastQuestionComment, QuizAttempt, SemesterOption } from '../types';

export interface StudioPrefill {
  title: string;
  courseCode: string;
  contentText: string;
  fileDataUrl?: string;
  fileMimeType?: string;
  fileName?: string;
  fileSizeBytes?: number;
  initialMode: 'summary' | 'quiz' | 'flashcards';
  savedQuiz?: QuizAttempt;
}

interface PastQuestionsPageProps {
  initialQuestionId?: string | null;
  onClearInitialQuestion?: () => void;
  onMessageAuthor?: (authorUid: string) => void;
  onSendToAIStudio: (prefill: StudioPrefill) => void;
}

export function PastQuestionsPage({
  initialQuestionId,
  onClearInitialQuestion,
  onMessageAuthor,
  onSendToAIStudio,
}: PastQuestionsPageProps) {
  const { user, profile, updateProfileData } = useAuth();
  const [questions, setQuestions] = useState<PastQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'peers' | 'my-courses' | 'mine'>('all');
  const [courseFilter, setCourseFilter] = useState<string>('ALL');
  const [examFilter, setExamFilter] = useState<string>('ALL');

  // Upload Modal State
  const [showUpload, setShowUpload] = useState(false);
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [university, setUniversity] = useState('');
  const [examYear, setExamYear] = useState(new Date().getFullYear());
  const [semester, setSemester] = useState<SemesterOption>('Semester 1');
  const [examType, setExamType] = useState<ExamTypeOption>('Final');
  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [solutionText, setSolutionText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileMimeType, setFileMimeType] = useState('');
  const [fileDataUrl, setFileDataUrl] = useState('');
  const [fileSizeBytes, setFileSizeBytes] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Active Paper Reader & Discussion State
  const [selected, setSelected] = useState<PastQuestion | null>(null);
  const [loadedFileDataUrl, setLoadedFileDataUrl] = useState('');
  const [loadingAttachment, setLoadingAttachment] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [comments, setComments] = useState<PastQuestionComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [shareTarget, setShareTarget] = useState<PastQuestion | null>(null);

  useEffect(() => {
    if (profile?.university && !university) {
      setUniversity(profile.university);
    }
  }, [profile, university]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'pastQuestions'), where('isPublic', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PastQuestion))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setQuestions(docs);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'pastQuestions');
      }
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!initialQuestionId || questions.length === 0) return;
    const found = questions.find((q) => q.id === initialQuestionId);
    if (found) {
      setSelected(found);
      setShowSolution(false);
      setAiExplanation(null);
      setExplainError(null);
      onClearInitialQuestion?.();
    }
  }, [initialQuestionId, questions, onClearInitialQuestion]);

  useEffect(() => {
    if (!selected) {
      setComments([]);
      setLoadedFileDataUrl('');
      setLoadingAttachment(false);
      return;
    }

    let cancelled = false;
    if (selected.fileDataUrl) {
      setLoadedFileDataUrl(selected.fileDataUrl);
      setLoadingAttachment(false);
    } else if (selected.fileChunkCount && selected.fileChunkCount > 0) {
      setLoadedFileDataUrl('');
      setLoadingAttachment(true);
      void loadAttachmentDataUrl('pastQuestions', selected.id, {
        inlineDataUrl: selected.fileDataUrl,
        chunkCount: selected.fileChunkCount,
        isPubliclyReadable: selected.isPublic,
        currentUserId: user?.uid,
        authorId: selected.authorId,
      })
        .then((url) => {
          if (!cancelled) setLoadedFileDataUrl(url);
        })
        .finally(() => {
          if (!cancelled) setLoadingAttachment(false);
        });
    } else {
      setLoadedFileDataUrl('');
      setLoadingAttachment(false);
    }

    const q = query(
      collection(db, 'pastQuestions', selected.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PastQuestionComment)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `pastQuestions/${selected.id}/comments`)
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [selected, user?.uid]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const parsed = await readStudyFile(file);
      setFileName(parsed.fileName);
      setFileMimeType(parsed.fileMimeType);
      setFileSizeBytes(parsed.fileSizeBytes);
      if (parsed.extractedText) {
        setQuestionText((prev) => (prev ? `${prev}\n\n${parsed.extractedText}` : parsed.extractedText!));
        setFileDataUrl(parsed.fileDataUrl || '');
      } else if (parsed.fileDataUrl) {
        setFileDataUrl(parsed.fileDataUrl);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to attach file.');
    }
  };

  const handleCreatePastQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const normCode = normalizeCourseCode(courseCode);
    if (!normCode || normCode.length < 2) {
      setUploadError('Enter a valid course code (e.g., CS301).');
      return;
    }
    if (!questionText.trim() && !fileDataUrl) {
      setUploadError('Provide the exam questions text or attach a past paper file.');
      return;
    }

    setSubmitting(true);
    setUploadError(null);
    setUploadProgress(null);
    try {
      const needsChunking = Boolean(fileDataUrl && fileDataUrl.length > MAX_INLINE_DATA_URL_CHARS);
      const plannedChunkCount = needsChunking ? splitDataUrlIntoChunks(fileDataUrl).length : 0;

      const payload: Record<string, unknown> = {
        authorId: user.uid,
        authorName: clampString(profile?.displayName || user.displayName || 'Student', 120),
        courseCode: normCode,
        courseTitle: clampString(courseTitle || normCode, 150),
        university: clampString(university || profile?.university || 'University', 150),
        examYear: Math.min(2035, Math.max(1990, Number(examYear) || new Date().getFullYear())),
        semester,
        examType,
        title: clampString(title, 180),
        questionText: clampString(questionText || `Attached file: ${fileName}`, 50000),
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (solutionText.trim()) payload.solutionText = clampString(solutionText, 50000);
      if (fileName) payload.fileName = clampString(fileName, 180);
      if (fileMimeType) payload.fileMimeType = clampString(fileMimeType, 100);
      if (fileSizeBytes > 0) payload.fileSizeBytes = fileSizeBytes;
      if (needsChunking) {
        payload.fileChunkCount = plannedChunkCount;
      } else if (fileDataUrl) {
        payload.fileDataUrl = fileDataUrl;
      }

      const docRef = await addDoc(collection(db, 'pastQuestions'), payload);

      if (needsChunking && fileDataUrl) {
        await uploadFileChunks('pastQuestions', docRef.id, fileDataUrl, user.uid, true, (done, total) => {
          setUploadProgress(`Uploading attachment (${done}/${total})...`);
        });
      }

      setShowUpload(false);
      setCourseCode('');
      setCourseTitle('');
      setTitle('');
      setQuestionText('');
      setSolutionText('');
      setFileName('');
      setFileMimeType('');
      setFileDataUrl('');
      setFileSizeBytes(0);
      setUploadProgress(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to save past question.');
      handleFirestoreError(err, OperationType.CREATE, 'pastQuestions');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExplainWithAI = async (pq: PastQuestion) => {
    setExplaining(true);
    setExplainError(null);
    try {
      const attachmentUrl =
        loadedFileDataUrl ||
        (await loadAttachmentDataUrl('pastQuestions', pq.id, {
          inlineDataUrl: pq.fileDataUrl,
          chunkCount: pq.fileChunkCount,
          isPubliclyReadable: pq.isPublic,
          currentUserId: user?.uid,
          authorId: pq.authorId,
        }));
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseCode: pq.courseCode,
          title: pq.title,
          questionText: pq.questionText,
          fileDataUrl: attachmentUrl || undefined,
          fileMimeType: pq.fileMimeType,
          fileName: pq.fileName,
        }),
      });
      const data = await parseAiResponse<{ explanation?: string }>(
        res,
        'Failed to explain question.'
      );
      setAiExplanation(data.explanation || '');
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : 'AI explanation failed.');
    } finally {
      setExplaining(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selected || !newComment.trim()) return;
    setPostingComment(true);
    try {
      await addDoc(collection(db, 'pastQuestions', selected.id, 'comments'), {
        authorId: user.uid,
        authorName: clampString(profile?.displayName || user.displayName || 'Student', 120),
        body: clampString(newComment, 4000),
        createdAt: serverTimestamp(),
      });
      setNewComment('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `pastQuestions/${selected.id}/comments`);
    } finally {
      setPostingComment(false);
    }
  };

  const handleDelete = async (pq: PastQuestion) => {
    if (!user || pq.authorId !== user.uid) return;
    try {
      await deleteFileChunks('pastQuestions', pq.id, user.uid, pq.fileChunkCount);
      await deleteDoc(doc(db, 'pastQuestions', pq.id));
      if (selected?.id === pq.id) setSelected(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `pastQuestions/${pq.id}`);
    }
  };

  const myCourses = profile?.courses || [];
  const availableCourses = Array.from(new Set(questions.map((q) => q.courseCode))).sort();

  const handleFollowCourse = async (code: string) => {
    if (!code || myCourses.includes(code) || myCourses.length >= 15) return;
    await updateProfileData({ courses: [...myCourses, code] });
  };

  const filtered = questions.filter((q) => {
    if (scope === 'mine' && q.authorId !== user?.uid) return false;
    if (scope === 'peers' && q.authorId === user?.uid) return false;
    if (scope === 'my-courses' && myCourses.length > 0 && !myCourses.includes(q.courseCode)) return false;
    if (courseFilter !== 'ALL' && q.courseCode !== courseFilter) return false;
    if (examFilter !== 'ALL' && q.examType !== examFilter) return false;
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      q.courseCode.toLowerCase().includes(s) ||
      q.courseTitle.toLowerCase().includes(s) ||
      q.title.toLowerCase().includes(s) ||
      q.authorName.toLowerCase().includes(s) ||
      (q.university || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Past Questions Repository
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Access past exam papers uploaded by students across courses, or publish your own for classmates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Upload Past Question
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedTabs
          layoutGroup="past-questions-scope"
          value={scope}
          onChange={setScope}
          options={[
            { id: 'all', label: 'All Papers' },
            { id: 'peers', label: 'From Other Students' },
            { id: 'my-courses', label: 'My Courses' },
            { id: 'mine', label: 'My Uploads' },
          ]}
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search course, title, author..."
              className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Courses</option>
            {availableCourses.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All Exam Types</option>
            <option value="Final">Final</option>
            <option value="Midterm">Midterm</option>
            <option value="Quiz">Quiz</option>
            <option value="Assignment">Assignment</option>
            <option value="Lab Exam">Lab Exam</option>
          </select>
        </div>
      </div>

      {/* Papers Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="skeleton-shimmer h-44 rounded-xl border border-slate-200 p-5 dark:border-slate-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <FileText className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            No past questions match this filter
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Be the first to upload a past exam paper for your course so classmates can study from it.
          </p>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Upload Past Question
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((pq) => (
            <div
              key={pq.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                    {pq.courseCode}
                  </span>
                  <span className="tabular-nums">
                    {pq.examType} · {pq.semester} {pq.examYear}
                  </span>
                </div>

                <h3 className="mt-2 font-display text-base font-semibold text-slate-900 line-clamp-2 dark:text-slate-100">
                  {pq.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 truncate dark:text-slate-400">
                  {pq.courseTitle}
                  {pq.university ? ` · ${pq.university}` : ''}
                </p>

                <p className="mt-3 text-xs leading-relaxed text-slate-600 line-clamp-3 dark:text-slate-300">
                  {pq.questionText}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                  By {pq.authorName} · {formatTimestamp(pq.createdAt)}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShareTarget(pq)}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    title="Share to peer"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(pq);
                      setShowSolution(false);
                      setAiExplanation(null);
                      setExplainError(null);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Open Paper
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Past Question Modal */}
      <ModalShell open={showUpload} onClose={() => setShowUpload(false)} maxWidthClass="max-w-2xl">
        <div className="max-h-[90vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Upload Past Question
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Saved to the shared repository for all students reading this course.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePastQuestion} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Course Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                    placeholder="e.g. CS301"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 uppercase focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
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
                    placeholder="e.g. Algorithms & Data Structures"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Paper Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. End of Semester Final Examination — Section A & B"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Year</label>
                  <input
                    type="number"
                    min={1990}
                    max={2035}
                    value={examYear}
                    onChange={(e) => setExamYear(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Semester</label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value as SemesterOption)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="Semester 1">Semester 1</option>
                    <option value="Semester 2">Semester 2</option>
                    <option value="Fall">Fall</option>
                    <option value="Spring">Spring</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Exam Type</label>
                  <select
                    value={examType}
                    onChange={(e) => setExamType(e.target.value as ExamTypeOption)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="Final">Final</option>
                    <option value="Midterm">Midterm</option>
                    <option value="Quiz">Quiz</option>
                    <option value="Assignment">Assignment</option>
                    <option value="Lab Exam">Lab Exam</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">University</label>
                  <input
                    type="text"
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    placeholder="Institution"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Attach Paper File (.pdf, .ppt/.pptx, .doc/.docx, .txt, .md, image up to 100 MB)
                  </label>
                  {fileName && (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Attached: {fileName}
                      {fileSizeBytes > 0 ? ` (${formatFileSize(fileSizeBytes)})` : ''}
                    </span>
                  )}
                </div>
                <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Upload className="h-4 w-4" />
                  <span>Choose PDF, slides, doc, image, or text file (max 100 MB)</span>
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.csv,.json,.tex,.pdf,.ppt,.pptx,.doc,.docx,image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Questions Text (Markdown supported) *
                </label>
                <textarea
                  rows={5}
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Paste or type the exam questions here (or upload a file above)..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Worked Solution / Answer Key (optional)
                </label>
                <textarea
                  rows={3}
                  value={solutionText}
                  onChange={(e) => setSolutionText(e.target.value)}
                  placeholder="Include marking scheme notes or worked solutions if available..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {uploadProgress && (
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400">{uploadProgress}</p>
              )}

              {uploadError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">{uploadError}</p>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {submitting ? uploadProgress || 'Publishing...' : 'Publish Past Question'}
                </button>
              </div>
            </form>
          </div>
      </ModalShell>

      {/* Selected Past Question Reader Modal */}
      <ModalShell open={Boolean(selected)} onClose={() => setSelected(null)} maxWidthClass="max-w-3xl">
        {selected && (
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                    {selected.courseCode}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selected.courseTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {selected.examType} · {selected.semester} {selected.examYear}
                  </span>
                </div>
                <h2 className="mt-1.5 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                  {selected.title}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Uploaded by {selected.authorName}
                  {selected.university ? ` · ${selected.university}` : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Action Bar */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleExplainWithAI(selected)}
                disabled={explaining}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {explaining ? 'Generating Solution Guide...' : 'AI Worked Solution'}
              </button>

              <button
                type="button"
                onClick={() =>
                  onSendToAIStudio({
                    title: selected.title,
                    courseCode: selected.courseCode,
                    contentText: selected.questionText,
                    fileDataUrl: loadedFileDataUrl || selected.fileDataUrl,
                    fileMimeType: selected.fileMimeType,
                    fileName: selected.fileName,
                    fileSizeBytes: selected.fileSizeBytes,
                    initialMode: 'quiz',
                  })
                }
                disabled={loadingAttachment}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Generate Practice Quiz
              </button>

              <button
                type="button"
                onClick={() => setShareTarget(selected)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share with Peer
              </button>

              {loadedFileDataUrl && (
                <a
                  href={loadedFileDataUrl}
                  download={selected.fileName || `${selected.courseCode}_past_paper`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Attachment{selected.fileSizeBytes ? ` (${formatFileSize(selected.fileSizeBytes)})` : ''}
                </a>
              )}

              {selected.authorId !== user?.uid && onMessageAuthor && (
                <button
                  type="button"
                  onClick={() => onMessageAuthor(selected.authorId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message {selected.authorName.split(' ')[0]}
                </button>
              )}

              {!myCourses.includes(selected.courseCode) ? (
                <button
                  type="button"
                  onClick={() => void handleFollowCourse(selected.courseCode)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Follow {selected.courseCode}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  In My Courses
                </span>
              )}

              {selected.authorId === user?.uid && (
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>

            {/* Question Content */}
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
              <MarkdownView content={selected.questionText} />

              {loadingAttachment && (
                <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Loading attachment ({selected.fileName || 'file'})...
                </p>
              )}

              {loadedFileDataUrl && selected.fileMimeType?.startsWith('image/') && (
                <img
                  src={loadedFileDataUrl}
                  alt={selected.fileName || 'Past exam attachment'}
                  referrerPolicy="no-referrer"
                  className="mt-4 max-h-96 rounded-lg border border-slate-200 object-contain dark:border-slate-800"
                />
              )}

              {loadedFileDataUrl && selected.fileMimeType === 'application/pdf' && (
                <iframe
                  src={loadedFileDataUrl}
                  title={selected.fileName || 'Past exam PDF'}
                  className="mt-4 h-96 w-full rounded-lg border border-slate-200 dark:border-slate-800"
                />
              )}
            </div>

            {/* Author Solution Toggle */}
            {selected.solutionText && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowSolution((s) => !s)}
                  className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                >
                  {showSolution ? 'Hide Uploaded Solution' : 'Reveal Uploaded Solution / Marking Scheme'}
                </button>
                {showSolution && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                    <MarkdownView content={selected.solutionText} />
                  </div>
                )}
              </div>
            )}

            {/* AI Explanation Output */}
            {explainError && (
              <div className="mt-4">
                <AiErrorBanner
                  message={explainError}
                  retrying={explaining}
                  onRetry={() => void handleExplainWithAI(selected)}
                />
              </div>
            )}
            {aiExplanation && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    AI Step-by-Step Solution Guide
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        downloadNotesAsHtml({
                          title: selected.title,
                          courseCode: selected.courseCode,
                          subtitle: `AI Worked Solution (${selected.examType} · ${selected.semester} ${selected.examYear})`,
                          markdownContent: aiExplanation,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Download className="h-3 w-3" />
                      Download HTML
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadNotesAsMarkdown({
                          title: selected.title,
                          courseCode: selected.courseCode,
                          subtitle: `AI Worked Solution (${selected.examType} · ${selected.semester} ${selected.examYear})`,
                          markdownContent: aiExplanation,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Download className="h-3 w-3" />
                      .MD
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <MarkdownView content={aiExplanation} />
                </div>
              </div>
            )}

            {/* Course Peer Discussion */}
            <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-500" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Course Discussion ({comments.length})
                </h3>
              </div>

              <div className="mt-3 space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{c.authorName}</span>
                      <span>{formatTimestamp(c.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{c.body}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handlePostComment} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share a worked step, hint, or question with classmates..."
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={postingComment || !newComment.trim()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                >
                  {postingComment ? 'Posting...' : 'Post'}
                </button>
              </form>
            </div>
          </div>
        )}
      </ModalShell>

      <ShareToPeerModal
        resource={
          shareTarget
            ? {
                type: 'pastQuestion',
                id: shareTarget.id,
                title: shareTarget.title,
                courseCode: shareTarget.courseCode,
              }
            : null
        }
        onClose={() => setShareTarget(null)}
      />
    </div>
  );
}
