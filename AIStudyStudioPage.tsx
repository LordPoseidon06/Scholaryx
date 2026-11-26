import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import {
  Bookmark,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileText,
  History,
  Layers,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { MarkdownView } from '../components/MarkdownView';
import { AiErrorBanner, EASE_OUT_EXPO, SegmentedTabs } from '../components/MotionPrimitives';
import { useAuth } from '../context/AuthContext';
import { useAiStudioQueue, type AiStudioJobResult, type AiStudioMode, type AiStudioQueueItem } from '../lib/aiQueue';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { loadAttachmentDataUrl } from '../lib/fileChunks';
import { downloadQuizAsHtml, downloadQuizAsMarkdown } from '../lib/quizExport';
import { downloadNotesAsHtml, downloadNotesAsMarkdown } from '../lib/notesExport';
import { clampString, formatFileSize, formatTimestamp, getTimestampMillis, normalizeCourseCode, readStudyFile } from '../lib/utils';
import type { GeneratedFlashcard, GeneratedQuizQuestion, PastQuestion, QuizAttempt, StudyMaterial } from '../types';
import type { StudioPrefill } from './PastQuestionsPage';

interface AIStudyStudioPageProps {
  prefill: StudioPrefill | null;
  onClearPrefill: () => void;
}

function isSyntheticPlaceholder(text: string): boolean {
  return /^(Uploaded resource|Attached file):\s.+$/i.test(text.trim());
}

function buildSelectedAnswersArray(
  total: number,
  answers: Record<number, number>
): number[] {
  const arr: number[] = [];
  for (let i = 0; i < total; i++) {
    arr.push(typeof answers[i] === 'number' ? answers[i] : -1);
  }
  return arr;
}

function sanitizeQuestionsForSave(questions: GeneratedQuizQuestion[]): GeneratedQuizQuestion[] {
  return questions.slice(0, 50).map((q) => ({
    question: clampString(q.question || '', 1800),
    options: (q.options || []).slice(0, 6).map((o) => clampString(String(o), 600)),
    correctIndex: Math.max(0, Math.min((q.options?.length || 1) - 1, Number(q.correctIndex) || 0)),
    explanation: clampString(q.explanation || '', 1200),
  }));
}

export function AIStudyStudioPage({ prefill, onClearPrefill }: AIStudyStudioPageProps) {
  const { user, profile } = useAuth();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [pastQuestions, setPastQuestions] = useState<PastQuestion[]>([]);
  const [savedQuizzes, setSavedQuizzes] = useState<QuizAttempt[]>([]);
  const [mode, setMode] = useState<'summary' | 'quiz' | 'flashcards'>('summary');

  const [selectedSourceKey, setSelectedSourceKey] = useState('');
  const [loadingSource, setLoadingSource] = useState(false);
  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [contentText, setContentText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileDataUrl, setFileDataUrl] = useState('');
  const [fileMimeType, setFileMimeType] = useState('');
  const [fileSizeBytes, setFileSizeBytes] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Summary state
  const [focusMode, setFocusMode] = useState<'standard' | 'exam' | 'brief'>('standard');
  const [summaryResult, setSummaryResult] = useState('');
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  // Quiz state
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('Exam Standard');
  const [quizTitle, setQuizTitle] = useState('');
  const [questions, setQuestions] = useState<GeneratedQuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [activeSavedQuizId, setActiveSavedQuizId] = useState<string | null>(null);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [showSavedQuizzes, setShowSavedQuizzes] = useState(false);

  // Flashcards state
  const [cardCount, setCardCount] = useState(8);
  const [cards, setCards] = useState<GeneratedFlashcard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleQueuedJobSuccess = (job: AiStudioQueueItem, result: AiStudioJobResult) => {
    setError(null);
    if (result.mode === 'summary') {
      setSummaryResult(result.summary);
      if (job.attempt > 1 || mode !== 'summary') {
        setSavedBanner('Queued study guide finished automatically and is ready in Note Summarizer.');
      }
    } else if (result.mode === 'quiz') {
      setQuizTitle(result.quizTitle);
      setQuestions(result.questions);
      setAnswers({});
      setQuizSubmitted(false);
      setActiveSavedQuizId(null);
      setShowSavedQuizzes(false);
      if (job.attempt > 1 || mode !== 'quiz') {
        setSavedBanner('Queued practice quiz finished automatically and is ready in Retention Quiz.');
      }
    } else {
      setCards(result.cards);
      setCardIdx(0);
      setCardFlipped(false);
      setShowHint(false);
      if (job.attempt > 1 || mode !== 'flashcards') {
        setSavedBanner('Queued flashcard deck finished automatically and is ready in Flashcards.');
      }
    }
  };

  const handleQueuedJobFatalError = (_job: AiStudioQueueItem, message: string) => {
    setError(message);
  };

  const {
    queue,
    nowMs,
    isOnline,
    enqueue,
    retryNow,
    cancelJob,
  } = useAiStudioQueue({
    uid: user?.uid,
    onSuccess: handleQueuedJobSuccess,
    onFatalError: handleQueuedJobFatalError,
  });

  const activeModeJob = queue.find((item) => item.mode === mode) || null;
  const generating = activeModeJob?.status === 'running';
  const activeModeQueued = activeModeJob && activeModeJob.status !== 'running' ? activeModeJob : null;
  const anyRunningJob = queue.find((item) => item.status === 'running') || null;

  useEffect(() => {
    if (!generating) {
      setLoadingStage('');
      return;
    }
    const stages =
      mode === 'quiz'
        ? [
            'Reading source material & learning objectives...',
            questionCount > 16
              ? `Synthesizing ${questionCount} exam questions across parallel batches...`
              : `Drafting ${questionCount} conceptual & applied questions...`,
            'Verifying answer keys, distractors, and rationales...',
          ]
        : mode === 'summary'
        ? [
            'Analyzing structure & key definitions...',
            'Organizing core concepts, equations & exam takeaways...',
            'Formatting study guide...',
          ]
        : [
            'Extracting high-yield recall pairs...',
            'Drafting concise prompts, hints & answers...',
          ];
    setLoadingStage(stages[0]);
    let idx = 0;
    const timer = window.setInterval(() => {
      idx = Math.min(stages.length - 1, idx + 1);
      setLoadingStage(stages[idx]);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [generating, mode, questionCount]);

  const loadQuizAttemptIntoWorkspace = (attempt: QuizAttempt) => {
    setMode('quiz');
    setTitle(attempt.title);
    setCourseCode(attempt.courseCode || '');
    if (attempt.difficulty) setDifficulty(attempt.difficulty);
    setQuizTitle(attempt.title);
    const loadedQuestions = attempt.questions || [];
    setQuestions(loadedQuestions);
    const restoredAnswers: Record<number, number> = {};
    (attempt.selectedAnswers || []).forEach((picked, idx) => {
      if (typeof picked === 'number' && picked >= 0) {
        restoredAnswers[idx] = picked;
      }
    });
    setAnswers(restoredAnswers);
    setQuizSubmitted(attempt.isGraded !== false);
    setActiveSavedQuizId(attempt.id);
    setShowSavedQuizzes(false);
    setError(null);
    setSavedBanner(
      attempt.isGraded === false
        ? 'Loaded saved quiz. Finish answering and click Grade & Save Score.'
        : 'Loaded graded quiz for review.'
    );
  };

  useEffect(() => {
    if (!prefill) return;
    if (prefill.savedQuiz) {
      loadQuizAttemptIntoWorkspace(prefill.savedQuiz);
      onClearPrefill();
      return;
    }
    setSelectedSourceKey('');
    setTitle(prefill.title);
    setCourseCode(prefill.courseCode);
    setContentText(isSyntheticPlaceholder(prefill.contentText) ? '' : prefill.contentText);
    setFileDataUrl(prefill.fileDataUrl || '');
    setFileMimeType(prefill.fileMimeType || '');
    setFileName(prefill.fileName || '');
    setFileSizeBytes(prefill.fileSizeBytes || 0);
    setMode(prefill.initialMode);
    setSummaryResult('');
    setQuestions([]);
    setAnswers({});
    setQuizSubmitted(false);
    setActiveSavedQuizId(null);
    setCards([]);
    setError(null);
    setSavedBanner(null);
    onClearPrefill();
  }, [prefill, onClearPrefill]);

  useEffect(() => {
    if (!user) return;
    const matQ = query(
      collection(db, 'studyMaterials'),
      where('visibility', 'in', ['course', 'public'])
    );
    const unsubMat = onSnapshot(
      matQ,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as StudyMaterial))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setMaterials(docs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studyMaterials')
    );

    const pqQ = query(collection(db, 'pastQuestions'), where('isPublic', '==', true));
    const unsubPq = onSnapshot(
      pqQ,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PastQuestion))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setPastQuestions(docs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pastQuestions')
    );

    const quizQ = query(
      collection(db, 'users', user.uid, 'quizAttempts'),
      where('ownerId', '==', user.uid)
    );
    const unsubQuizzes = onSnapshot(
      quizQ,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as QuizAttempt))
          .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setSavedQuizzes(docs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/quizAttempts`)
    );

    return () => {
      unsubMat();
      unsubPq();
      unsubQuizzes();
    };
  }, [user]);

  const handleClearFile = () => {
    setFileName('');
    setFileDataUrl('');
    setFileMimeType('');
    setFileSizeBytes(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearAllSource = () => {
    setSelectedSourceKey('');
    setTitle('');
    setCourseCode('');
    setContentText('');
    handleClearFile();
    setError(null);
    setSavedBanner(null);
  };

  const handleLoadSavedMaterial = async (value: string) => {
    setSelectedSourceKey(value);
    if (!value) return;
    setError(null);
    setSavedBanner(null);
    setLoadingSource(true);
    try {
      if (value.startsWith('pq:')) {
        const id = value.slice(3);
        const pq = pastQuestions.find((q) => q.id === id);
        if (!pq) return;
        setTitle(pq.title);
        setCourseCode(pq.courseCode);
        setContentText(isSyntheticPlaceholder(pq.questionText) ? '' : pq.questionText);
        setFileName(pq.fileName || '');
        setFileMimeType(pq.fileMimeType || '');
        setFileSizeBytes(pq.fileSizeBytes || 0);
        if (pq.fileDataUrl) {
          setFileDataUrl(pq.fileDataUrl);
        } else if (pq.fileChunkCount && pq.fileChunkCount > 0) {
          const url = await loadAttachmentDataUrl('pastQuestions', pq.id, {
            inlineDataUrl: pq.fileDataUrl,
            chunkCount: pq.fileChunkCount,
            isPubliclyReadable: pq.isPublic,
            currentUserId: user?.uid,
            authorId: pq.authorId,
          });
          setFileDataUrl(url);
        } else {
          setFileDataUrl('');
        }
        return;
      }

      const id = value.startsWith('mat:') ? value.slice(4) : value;
      const found = materials.find((m) => m.id === id);
      if (!found) return;
      setTitle(found.title);
      setCourseCode(found.courseCode);
      setContentText(isSyntheticPlaceholder(found.contentText) ? '' : found.contentText);
      setFileName(found.fileName || '');
      setFileMimeType(found.fileMimeType || '');
      setFileSizeBytes(found.fileSizeBytes || 0);
      if (found.fileDataUrl) {
        setFileDataUrl(found.fileDataUrl);
      } else if (found.fileChunkCount && found.fileChunkCount > 0) {
        const url = await loadAttachmentDataUrl('studyMaterials', found.id, {
          inlineDataUrl: found.fileDataUrl,
          chunkCount: found.fileChunkCount,
          isPubliclyReadable: found.visibility !== 'private',
          currentUserId: user?.uid,
          authorId: found.authorId,
        });
        setFileDataUrl(url);
      } else {
        setFileDataUrl('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load attachment from library.');
    } finally {
      setLoadingSource(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSavedBanner(null);
    try {
      const parsed = await readStudyFile(file);
      setSelectedSourceKey('');
      setFileName(parsed.fileName);
      setFileMimeType(parsed.fileMimeType);
      setFileSizeBytes(parsed.fileSizeBytes);
      if (!title.trim()) {
        setTitle(parsed.fileName.replace(/\.[^.]+$/, ''));
      }
      if (parsed.extractedText) {
        setContentText(parsed.extractedText);
        setFileDataUrl(parsed.fileDataUrl || '');
      } else {
        setFileDataUrl(parsed.fileDataUrl || '');
        if (isSyntheticPlaceholder(contentText)) {
          setContentText('');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read file.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const hasValidSourceInput = Boolean(
    (!isSyntheticPlaceholder(contentText) && contentText.trim()) || fileDataUrl
  );

  const handleGenerate = () => {
    if (!hasValidSourceInput || loadingSource || generating) return;
    setError(null);
    setSavedBanner(null);

    enqueue(mode, {
      title,
      courseCode,
      contentText,
      fileDataUrl,
      fileMimeType,
      fileName,
      focusMode,
      questionCount,
      difficulty,
      cardCount,
    });
  };

  const getCountdownSeconds = (item: AiStudioQueueItem): number => {
    if (!item.nextRetryAt) return 0;
    return Math.max(0, Math.ceil((item.nextRetryAt - nowMs) / 1000));
  };

  const getModeDisplayName = (m: AiStudioMode): string => {
    if (m === 'summary') return 'Note Summarizer';
    if (m === 'quiz') return 'Retention Quiz';
    return 'Flashcards';
  };

  const handleCopySummary = async () => {
    if (!summaryResult) return;
    try {
      await navigator.clipboard.writeText(summaryResult);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      setError('Unable to copy summary to clipboard.');
    }
  };

  const handleSaveQuizForLater = async () => {
    if (!user || questions.length === 0) return;
    setSavingQuiz(true);
    setError(null);
    const cleanQuestions = sanitizeQuestionsForSave(questions);
    const selectedAnswers = buildSelectedAnswersArray(cleanQuestions.length, answers);
    const correctCount = cleanQuestions.reduce(
      (acc, q, idx) => acc + (selectedAnswers[idx] === q.correctIndex ? 1 : 0),
      0
    );
    const pct = quizSubmitted
      ? Math.round((correctCount / cleanQuestions.length) * 100)
      : 0;

    try {
      if (activeSavedQuizId) {
        await updateDoc(doc(db, 'users', user.uid, 'quizAttempts', activeSavedQuizId), {
          score: pct,
          isGraded: quizSubmitted,
          selectedAnswers,
          updatedAt: serverTimestamp(),
        });
      } else {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'quizAttempts'), {
          ownerId: user.uid,
          title: clampString(quizTitle || title || 'AI Retention Quiz', 180),
          courseCode: normalizeCourseCode(courseCode || 'GENERAL') || 'GENERAL',
          difficulty: clampString(difficulty || 'Exam Standard', 40),
          score: pct,
          totalQuestions: cleanQuestions.length,
          isGraded: quizSubmitted,
          questions: cleanQuestions,
          selectedAnswers,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setActiveSavedQuizId(docRef.id);
      }
      setSavedBanner('Quiz saved! Reopen it anytime from Saved Quizzes or your Progress page to review or continue.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/quizAttempts`);
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleSubmitQuiz = async () => {
    setQuizSubmitted(true);
    if (!user || questions.length === 0) return;

    const cleanQuestions = sanitizeQuestionsForSave(questions);
    const selectedAnswers = buildSelectedAnswersArray(cleanQuestions.length, answers);
    const correctCount = cleanQuestions.reduce(
      (acc, q, idx) => acc + (selectedAnswers[idx] === q.correctIndex ? 1 : 0),
      0
    );
    const pct = Math.round((correctCount / cleanQuestions.length) * 100);

    try {
      if (activeSavedQuizId) {
        await updateDoc(doc(db, 'users', user.uid, 'quizAttempts', activeSavedQuizId), {
          score: pct,
          isGraded: true,
          selectedAnswers,
          updatedAt: serverTimestamp(),
        });
      } else {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'quizAttempts'), {
          ownerId: user.uid,
          title: clampString(quizTitle || title || 'AI Retention Quiz', 180),
          courseCode: normalizeCourseCode(courseCode || 'GENERAL') || 'GENERAL',
          difficulty: clampString(difficulty || 'Exam Standard', 40),
          score: pct,
          totalQuestions: cleanQuestions.length,
          isGraded: true,
          questions: cleanQuestions,
          selectedAnswers,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setActiveSavedQuizId(docRef.id);
      }
      setSavedBanner(`Quiz score (${pct}%) saved for review in Saved Quizzes & Progress Tracker.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/quizAttempts`);
    }
  };

  const handleRetakeQuiz = () => {
    setAnswers({});
    setQuizSubmitted(false);
    setActiveSavedQuizId(null);
    setSavedBanner(null);
  };

  const handleDeleteSavedQuiz = async (attemptId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'quizAttempts', attemptId));
      if (activeSavedQuizId === attemptId) {
        setActiveSavedQuizId(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/quizAttempts/${attemptId}`);
    }
  };

  const handleSaveSummaryToLibrary = async () => {
    if (!user || !summaryResult) return;
    const normCode = normalizeCourseCode(courseCode || 'STUDY');
    setSavingMaterial(true);
    try {
      await addDoc(collection(db, 'studyMaterials'), {
        authorId: user.uid,
        authorName: clampString(profile?.displayName || user.displayName || 'Student', 120),
        courseCode: normCode || 'STUDY',
        courseTitle: clampString(title || normCode || 'AI Study Guide', 150),
        materialType: 'Cheat Sheet',
        title: clampString(`${title || normCode} — AI Summary`, 180),
        contentText: clampString(contentText || summaryResult, 60000),
        aiSummary: clampString(summaryResult, 15000),
        visibility: 'course',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSavedBanner('Saved AI summary to the shared Course Materials library.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'studyMaterials');
    } finally {
      setSavingMaterial(false);
    }
  };

  const answeredCount = Object.keys(answers).length;
  const correctTotal = questions.reduce(
    (acc, q, idx) => acc + (answers[idx] === q.correctIndex ? 1 : 0),
    0
  );
  const currentScorePct =
    questions.length > 0 ? Math.round((correctTotal / questions.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            AI Study Studio
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Summarize lecture notes and large files (up to 100 MB), generate up to 50-question quizzes, download sheets, and review anytime.
          </p>
        </div>

        <SegmentedTabs
          layoutGroup="ai-studio-mode"
          value={mode}
          onChange={(tab) => {
            setMode(tab);
            setError(null);
          }}
          options={[
            { id: 'summary', label: 'Note Summarizer' },
            { id: 'quiz', label: 'Retention Quiz' },
            { id: 'flashcards', label: 'Flashcards' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Input Source Column */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Source Material
            </h2>
            {(title || courseCode || contentText || fileName) && (
              <button
                type="button"
                onClick={handleClearAllSource}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Clear Source
              </button>
            )}
          </div>

          {(materials.length > 0 || pastQuestions.length > 0) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Load from Shared Library (Materials &amp; Past Papers)
              </label>
              <select
                value={selectedSourceKey}
                onChange={(e) => void handleLoadSavedMaterial(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="">Choose a shared note, slide deck, or past paper...</option>
                {materials.length > 0 && (
                  <optgroup label="Study Materials">
                    {materials.map((m) => (
                      <option key={m.id} value={`mat:${m.id}`}>
                        {m.courseCode} · {m.title} ({m.authorName})
                      </option>
                    ))}
                  </optgroup>
                )}
                {pastQuestions.length > 0 && (
                  <optgroup label="Past Questions">
                    {pastQuestions.map((pq) => (
                      <option key={pq.id} value={`pq:${pq.id}`}>
                        {pq.courseCode} · {pq.title} ({pq.authorName})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Course Code
              </label>
              <input
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                placeholder="e.g. CS301"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 uppercase focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Topic / Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Dynamic Programming"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Attach Document, Slides, Image, or Text (up to 100 MB)
            </label>
            <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900">
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span>Attach file (.pdf, .docx, .pptx, .txt, .md, image — max 100 MB)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.csv,.json,.tex,.pdf,.docx,.pptx,image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {loadingSource && (
              <p className="mt-2 text-xs font-medium text-blue-700 dark:text-blue-400">
                Loading attachment from library...
              </p>
            )}

            {fileName && !loadingSource && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-medium">{fileName}</span>
                  {fileSizeBytes > 0 && (
                    <span className="shrink-0 font-mono text-[11px] opacity-80">
                      ({formatFileSize(fileSizeBytes)})
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClearFile}
                  className="shrink-0 rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                  title="Remove attached file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Paste Lecture Notes or Textbook Excerpt
            </label>
            <textarea
              rows={8}
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              placeholder={
                fileDataUrl
                  ? 'Optional: add extra focus instructions or notes alongside your attached file...'
                  : 'Paste your lecture notes, slide bullets, or study readings here...'
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          {/* Mode-Specific Controls */}
          {mode === 'summary' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Summary Format
              </label>
              <select
                value={focusMode}
                onChange={(e) => setFocusMode(e.target.value as typeof focusMode)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="standard">Structured Study Guide</option>
                <option value="exam">Exam-Focused High-Yield Review</option>
                <option value="brief">2-Minute Quick Revision Sheet</option>
              </select>
            </div>
          )}

          {mode === 'quiz' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Questions (up to 50)
                </label>
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value={5}>5 Questions</option>
                  <option value={10}>10 Questions</option>
                  <option value={15}>15 Questions</option>
                  <option value={20}>20 Questions</option>
                  <option value={30}>30 Questions</option>
                  <option value={40}>40 Questions</option>
                  <option value={50}>50 Questions</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="Foundational">Foundational</option>
                  <option value="Exam Standard">Exam Standard</option>
                  <option value="Challenging">Challenging</option>
                </select>
              </div>
            </div>
          )}

          {mode === 'flashcards' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Deck Size
              </label>
              <select
                value={cardCount}
                onChange={(e) => setCardCount(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value={5}>5 Flashcards</option>
                <option value={8}>8 Flashcards</option>
                <option value={12}>12 Flashcards</option>
                <option value={16}>16 Flashcards</option>
              </select>
            </div>
          )}

          {!isOnline && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-200">
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span>You are offline. Requests you submit will queue locally and run automatically once connected.</span>
            </div>
          )}

          {activeModeQueued && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  {activeModeQueued.status === 'paused_offline' ? (
                    <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {activeModeQueued.status === 'paused_offline'
                        ? 'Queued — Waiting for network connection'
                        : activeModeQueued.status === 'paused_limit'
                        ? `Auto-retry paused after ${activeModeQueued.maxAttempts} attempts`
                        : anyRunningJob && anyRunningJob.id !== activeModeQueued.id
                        ? `Queued behind active ${getModeDisplayName(anyRunningJob.mode)} request`
                        : `Queued — Retrying automatically in ${getCountdownSeconds(activeModeQueued)}s`}
                    </p>
                    <p className="mt-0.5 leading-relaxed opacity-90">
                      {activeModeQueued.lastError ||
                        'Waiting in the local queue. It will start automatically as soon as capacity is available.'}
                    </p>
                    <p className="mt-1 font-mono text-[11px] tabular-nums opacity-80">
                      Attempt {activeModeQueued.attempt} of {activeModeQueued.maxAttempts}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => retryNow(activeModeQueued.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"
                >
                  <RotateCw className="h-3 w-3" />
                  Retry Now
                </button>
                <button
                  type="button"
                  onClick={() => cancelJob(activeModeQueued.id)}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <AiErrorBanner
              message={error}
              retrying={generating}
              onRetry={() => handleGenerate()}
            />
          )}
          {savedBanner && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{savedBanner}</p>
          )}

          <button
            type="button"
            disabled={generating || loadingSource || !hasValidSourceInput}
            onClick={handleGenerate}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            {generating
              ? mode === 'quiz' && questionCount >= 25
                ? `Generating ${questionCount} Questions...`
                : 'Generating with AI...'
              : loadingSource
              ? 'Loading Attachment...'
              : activeModeQueued
              ? 'Re-Queue Request'
              : mode === 'summary'
              ? 'Summarize Notes'
              : mode === 'quiz'
              ? `Generate ${questionCount}-Question Quiz`
              : 'Generate Flashcard Deck'}
          </button>

          <AnimatePresence initial={false}>
            {queue.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-950/70"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Local Request Queue ({queue.length})
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    Auto-retry active
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {queue.map((item) => {
                    const countdown = getCountdownSeconds(item);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                      >
                        <button
                          type="button"
                          onClick={() => setMode(item.mode)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {getModeDisplayName(item.mode)}
                            {item.courseCode ? ` · ${item.courseCode}` : ''}
                            {item.label ? ` · ${item.label}` : ''}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                            {item.status === 'running'
                              ? `Running attempt ${item.attempt}/${item.maxAttempts}...`
                              : item.status === 'paused_offline'
                              ? 'Paused (offline) · will auto-run online'
                              : item.status === 'paused_limit'
                              ? `Paused after ${item.maxAttempts} attempts`
                              : `Waiting · auto-retry in ${countdown}s (${item.attempt}/${item.maxAttempts})`}
                          </p>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {item.status !== 'running' && (
                            <button
                              type="button"
                              onClick={() => retryNow(item.id)}
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              title="Retry immediately"
                            >
                              Retry Now
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => cancelJob(item.id)}
                            className="rounded p-1 text-slate-400 hover:text-red-600"
                            title="Cancel queued request"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Output Workspace Column */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          {mode === 'summary' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Generated Study Summary
                </h2>
                {summaryResult && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        downloadNotesAsHtml({
                          title: title || 'AI Study Notes',
                          courseCode,
                          subtitle:
                            focusMode === 'exam'
                              ? 'Exam-Focused High-Yield Review'
                              : focusMode === 'brief'
                              ? '2-Minute Quick Revision Sheet'
                              : 'Structured Study Guide',
                          markdownContent: summaryResult,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      title="Download formatted study notes as offline HTML (with Print / Save PDF)"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download HTML
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadNotesAsMarkdown({
                          title: title || 'AI Study Notes',
                          courseCode,
                          subtitle:
                            focusMode === 'exam'
                              ? 'Exam-Focused High-Yield Review'
                              : focusMode === 'brief'
                              ? '2-Minute Quick Revision Sheet'
                              : 'Structured Study Guide',
                          markdownContent: summaryResult,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      title="Download generated notes as Markdown (.md)"
                    >
                      <Download className="h-3.5 w-3.5" />
                      .MD
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopySummary()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {copiedSummary ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={savingMaterial}
                      onClick={handleSaveSummaryToLibrary}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {savingMaterial ? 'Saving...' : 'Save to Course Library'}
                    </button>
                  </div>
                )}
              </div>

              {generating ? (
                <div className="space-y-4 py-8">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                      {loadingStage || 'Synthesizing study summary...'}
                    </p>
                    {activeModeJob && activeModeJob.attempt > 1 && (
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        Attempt {activeModeJob.attempt}/{activeModeJob.maxAttempts}
                      </span>
                    )}
                  </div>
                  <div className="skeleton-shimmer h-5 w-1/3 rounded-md" />
                  <div className="skeleton-shimmer h-3.5 w-full rounded" />
                  <div className="skeleton-shimmer h-3.5 w-11/12 rounded" />
                  <div className="skeleton-shimmer h-3.5 w-4/5 rounded" />
                  <div className="skeleton-shimmer h-3.5 w-5/6 rounded" />
                </div>
              ) : activeModeQueued ? (
                <div className="my-6 rounded-xl border border-amber-200 bg-amber-50/70 p-6 dark:border-amber-900/60 dark:bg-amber-950/25">
                  <div className="flex items-start gap-3">
                    {activeModeQueued.status === 'paused_offline' ? (
                      <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                    ) : (
                      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {activeModeQueued.status === 'paused_offline'
                          ? 'Study Guide Queued Until Online'
                          : activeModeQueued.status === 'paused_limit'
                          ? 'Auto-Retry Paused (AI Still Busy)'
                          : `Study Guide Queued · Retrying in ${getCountdownSeconds(activeModeQueued)}s`}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {activeModeQueued.lastError ||
                          'Your summarization request is queued locally and will resume automatically as soon as capacity is available.'}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => retryNow(activeModeQueued.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          Retry Now
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelJob(activeModeQueued.id)}
                          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Cancel Request
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : summaryResult ? (
                <div className="mt-4">
                  <MarkdownView content={summaryResult} />
                </div>
              ) : (
                <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                  Paste your notes, upload a document (.pdf, .docx, .pptx, image up to 100 MB), or select a library item on the left, then click Summarize Notes.
                </div>
              )}
            </>
          )}

          {mode === 'quiz' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    {quizTitle || 'Interactive Retention Quiz'}
                  </h2>
                  {questions.length > 0 && !quizSubmitted && (
                    <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      Answered: {answeredCount} / {questions.length}
                    </p>
                  )}
                  {quizSubmitted && questions.length > 0 && (
                    <p className="mt-0.5 font-mono text-xs font-semibold text-blue-700 tabular-nums dark:text-blue-400">
                      Score: {correctTotal} / {questions.length} ({currentScorePct}%)
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {savedQuizzes.some((q) => q.questions && q.questions.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setShowSavedQuizzes((s) => !s)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        showSavedQuizzes
                          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <History className="h-3.5 w-3.5" />
                      Saved Quizzes ({savedQuizzes.filter((q) => q.questions && q.questions.length > 0).length})
                    </button>
                  )}

                  {questions.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          downloadQuizAsHtml({
                            title: quizTitle || title || 'Practice Quiz',
                            courseCode,
                            difficulty,
                            questions,
                            answers,
                            isGraded: quizSubmitted,
                            scorePercent: currentScorePct,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        title="Download printable offline HTML quiz with answer key toggle"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download HTML
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          downloadQuizAsMarkdown({
                            title: quizTitle || title || 'Practice Quiz',
                            courseCode,
                            difficulty,
                            questions,
                            answers,
                            isGraded: quizSubmitted,
                            scorePercent: currentScorePct,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        title="Download quiz & answer key as Markdown"
                      >
                        <Download className="h-3.5 w-3.5" />
                        .MD
                      </button>

                      {!quizSubmitted && (
                        <button
                          type="button"
                          disabled={savingQuiz}
                          onClick={() => void handleSaveQuizForLater()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Bookmark className="h-3.5 w-3.5" />
                          {savingQuiz ? 'Saving...' : 'Save for Later'}
                        </button>
                      )}

                      {!quizSubmitted ? (
                        <button
                          type="button"
                          onClick={handleSubmitQuiz}
                          className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                        >
                          Grade &amp; Save Score
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleRetakeQuiz}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Retake Quiz
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {showSavedQuizzes && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                    className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                  >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      Saved Quizzes for Review
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowSavedQuizzes(false)}
                      className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {savedQuizzes
                      .filter((sq) => sq.questions && sq.questions.length > 0)
                      .map((sq) => (
                        <div
                          key={sq.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                              {sq.title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              {sq.courseCode || 'GENERAL'} · {sq.totalQuestions} Qs ·{' '}
                              {sq.isGraded === false ? 'Saved (Not graded)' : `Score: ${sq.score}%`} ·{' '}
                              {formatTimestamp(sq.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => loadQuizAttemptIntoWorkspace(sq)}
                              className="rounded-md bg-blue-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-800"
                            >
                              {sq.isGraded === false ? 'Resume' : 'Review'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                downloadQuizAsHtml({
                                  title: sq.title,
                                  courseCode: sq.courseCode,
                                  difficulty: sq.difficulty,
                                  questions: sq.questions || [],
                                  answers: sq.selectedAnswers,
                                  isGraded: sq.isGraded !== false,
                                  scorePercent: sq.score,
                                })
                              }
                              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                              title="Download HTML quiz"
                            >
                              <Download className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSavedQuiz(sq.id)}
                              className="rounded-md p-1 text-slate-400 hover:text-red-600"
                              title="Delete saved quiz"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {questions.length > 0 && !generating && (
                <div className="mt-4">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <motion.div
                      className={`h-full rounded-full ${
                        quizSubmitted
                          ? currentScorePct >= 70
                            ? 'bg-emerald-600'
                            : 'bg-amber-500'
                          : 'bg-blue-700 dark:bg-blue-500'
                      }`}
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.round((answeredCount / Math.max(1, questions.length)) * 100)}%`,
                      }}
                      transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                    />
                  </div>
                </div>
              )}

              {generating ? (
                <div className="space-y-4 py-8">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                      {loadingStage || 'Preparing retention quiz...'}
                    </p>
                    {activeModeJob && activeModeJob.attempt > 1 && (
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        Attempt {activeModeJob.attempt}/{activeModeJob.maxAttempts}
                      </span>
                    )}
                  </div>
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="space-y-2.5">
                      <div className="skeleton-shimmer h-4 w-3/4 rounded" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="skeleton-shimmer h-9 rounded-lg" />
                        <div className="skeleton-shimmer h-9 rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeModeQueued ? (
                <div className="my-6 rounded-xl border border-amber-200 bg-amber-50/70 p-6 dark:border-amber-900/60 dark:bg-amber-950/25">
                  <div className="flex items-start gap-3">
                    {activeModeQueued.status === 'paused_offline' ? (
                      <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                    ) : (
                      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {activeModeQueued.status === 'paused_offline'
                          ? 'Quiz Queued Until Online'
                          : activeModeQueued.status === 'paused_limit'
                          ? 'Auto-Retry Paused (AI Still Busy)'
                          : `Quiz Queued · Retrying in ${getCountdownSeconds(activeModeQueued)}s`}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {activeModeQueued.lastError ||
                          'Your quiz generation request is queued locally and will retry automatically once AI capacity opens up.'}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => retryNow(activeModeQueued.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          Retry Now
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelJob(activeModeQueued.id)}
                          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Cancel Request
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : questions.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                  Generate a quiz (up to 50 questions) from any lecture note, slide deck, or past paper—then download it, save it for later, or grade and review your answers.
                </div>
              ) : (
                <div className="mt-4 max-h-[75vh] space-y-6 overflow-y-auto pr-1">
                  {questions.map((q, idx) => {
                    const selectedIdx = answers[idx];
                    return (
                      <div key={idx} className="space-y-2.5 border-b border-slate-100 pb-5 last:border-b-0 dark:border-slate-800">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          <span className="mr-2 font-mono text-xs text-slate-500 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          {q.question}
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {q.options.map((opt, optIdx) => {
                            const isPicked = selectedIdx === optIdx;
                            const isCorrect = q.correctIndex === optIdx;
                            let stateCls =
                              'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800';
                            if (quizSubmitted) {
                              if (isCorrect) {
                                stateCls =
                                  'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
                              } else if (isPicked && !isCorrect) {
                                stateCls =
                                  'border-red-400 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200';
                              }
                            } else if (isPicked) {
                              stateCls =
                                'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200';
                            }

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                disabled={quizSubmitted}
                                onClick={() => setAnswers((prev) => ({ ...prev, [idx]: optIdx }))}
                                className={`flex items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${stateCls}`}
                              >
                                <span>{opt}</span>
                                {quizSubmitted && isCorrect && (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                )}
                                {quizSubmitted && isPicked && !isCorrect && (
                                  <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {quizSubmitted && (
                          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                            Explanation: {q.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {mode === 'flashcards' && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Active-Recall Flashcards
                  </h2>
                </div>
                {cards.length > 0 && (
                  <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    Card {cardIdx + 1} / {cards.length}
                  </span>
                )}
              </div>

              {generating ? (
                <div className="space-y-4 py-10">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                      {loadingStage || 'Building active-recall deck...'}
                    </p>
                    {activeModeJob && activeModeJob.attempt > 1 && (
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        Attempt {activeModeJob.attempt}/{activeModeJob.maxAttempts}
                      </span>
                    )}
                  </div>
                  <div className="skeleton-shimmer h-60 w-full rounded-xl" />
                </div>
              ) : activeModeQueued ? (
                <div className="my-6 rounded-xl border border-amber-200 bg-amber-50/70 p-6 dark:border-amber-900/60 dark:bg-amber-950/25">
                  <div className="flex items-start gap-3">
                    {activeModeQueued.status === 'paused_offline' ? (
                      <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                    ) : (
                      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {activeModeQueued.status === 'paused_offline'
                          ? 'Flashcards Queued Until Online'
                          : activeModeQueued.status === 'paused_limit'
                          ? 'Auto-Retry Paused (AI Still Busy)'
                          : `Flashcards Queued · Retrying in ${getCountdownSeconds(activeModeQueued)}s`}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {activeModeQueued.lastError ||
                          'Your flashcard deck request is queued locally and will resume automatically once AI capacity opens up.'}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => retryNow(activeModeQueued.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          Retry Now
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelJob(activeModeQueued.id)}
                          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Cancel Request
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : cards.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                  Generate a flashcard deck from your notes to practice active recall before exams.
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <motion.div
                      className="h-full rounded-full bg-blue-700 dark:bg-blue-500"
                      initial={false}
                      animate={{ width: `${Math.round(((cardIdx + 1) / Math.max(1, cards.length)) * 100)}%` }}
                      transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    />
                  </div>

                  <div className="perspective-1200">
                    <motion.button
                      key={cardIdx}
                      type="button"
                      onClick={() => setCardFlipped((f) => !f)}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0, rotateY: cardFlipped ? 180 : 0 }}
                      transition={{ duration: 0.42, ease: EASE_OUT_EXPO }}
                      className="preserve-3d relative min-h-[250px] w-full cursor-pointer text-center"
                    >
                      <div className="backface-hidden absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-600">
                        <span className="text-xs font-medium text-slate-400">
                          Prompt (click to reveal answer)
                        </span>
                        <p className="mt-4 max-w-lg font-display text-lg font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                          {cards[cardIdx].front}
                        </p>
                      </div>

                      <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-blue-200 bg-blue-50/70 p-8 dark:border-blue-800 dark:bg-blue-950/35">
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                          Answer (click to flip back)
                        </span>
                        <p className="mt-4 max-w-lg font-display text-lg font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                          {cards[cardIdx].back}
                        </p>
                      </div>
                    </motion.button>
                  </div>

                  {showHint && !cardFlipped && (
                    <p className="text-center text-xs text-amber-700 dark:text-amber-300">
                      Hint: {cards[cardIdx].hint}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      disabled={cardIdx === 0}
                      onClick={() => {
                        setCardIdx((i) => Math.max(0, i - 1));
                        setCardFlipped(false);
                        setShowHint(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowHint((h) => !h)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                      >
                        {showHint ? 'Hide Hint' : 'Show Hint'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCardFlipped((f) => !f)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                        Flip
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={cardIdx >= cards.length - 1}
                      onClick={() => {
                        setCardIdx((i) => Math.min(cards.length - 1, i + 1));
                        setCardFlipped(false);
                        setShowHint(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
