import React, { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { CheckCircle2, ChevronLeft, ChevronRight, Layers, RotateCw, Sparkles, Upload, XCircle } from 'lucide-react';
import { MarkdownView } from '../components/MarkdownView';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString, getTimestampMillis, normalizeCourseCode, readStudyFile } from '../lib/utils';
import type { GeneratedFlashcard, GeneratedQuizQuestion, PastQuestion, StudyMaterial } from '../types';
import type { StudioPrefill } from './PastQuestionsPage';

interface AIStudyStudioPageProps {
  prefill: StudioPrefill | null;
  onClearPrefill: () => void;
}

export function AIStudyStudioPage({ prefill, onClearPrefill }: AIStudyStudioPageProps) {
  const { user, profile } = useAuth();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [pastQuestions, setPastQuestions] = useState<PastQuestion[]>([]);
  const [mode, setMode] = useState<'summary' | 'quiz' | 'flashcards'>('summary');

  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [contentText, setContentText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileDataUrl, setFileDataUrl] = useState('');
  const [fileMimeType, setFileMimeType] = useState('');

  // Summary state
  const [focusMode, setFocusMode] = useState<'standard' | 'exam' | 'brief'>('standard');
  const [summaryResult, setSummaryResult] = useState('');
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  // Quiz state
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState('Exam Standard');
  const [quizTitle, setQuizTitle] = useState('');
  const [questions, setQuestions] = useState<GeneratedQuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Flashcards state
  const [cards, setCards] = useState<GeneratedFlashcard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setTitle(prefill.title);
    setCourseCode(prefill.courseCode);
    setContentText(prefill.contentText);
    setFileDataUrl(prefill.fileDataUrl || '');
    setFileMimeType(prefill.fileMimeType || '');
    setMode(prefill.initialMode);
    setSummaryResult('');
    setQuestions([]);
    setCards([]);
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

    return () => {
      unsubMat();
      unsubPq();
    };
  }, [user]);

  const handleLoadSavedMaterial = (value: string) => {
    if (!value) return;
    if (value.startsWith('pq:')) {
      const id = value.slice(3);
      const pq = pastQuestions.find((q) => q.id === id);
      if (!pq) return;
      setTitle(pq.title);
      setCourseCode(pq.courseCode);
      setContentText(pq.questionText);
      setFileName(pq.fileName || '');
      setFileDataUrl(pq.fileDataUrl || '');
      setFileMimeType(pq.fileMimeType || '');
      return;
    }
    const id = value.startsWith('mat:') ? value.slice(4) : value;
    const found = materials.find((m) => m.id === id);
    if (!found) return;
    setTitle(found.title);
    setCourseCode(found.courseCode);
    setContentText(found.contentText);
    setFileName(found.fileName || '');
    setFileDataUrl(found.fileDataUrl || '');
    setFileMimeType(found.fileMimeType || '');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = await readStudyFile(file);
      setFileName(parsed.fileName);
      setFileMimeType(parsed.fileMimeType);
      if (!title) setTitle(parsed.fileName.replace(/\.[^.]+$/, ''));
      if (parsed.extractedText) {
        setContentText(parsed.extractedText);
        setFileDataUrl('');
      } else if (parsed.fileDataUrl) {
        setFileDataUrl(parsed.fileDataUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read file.');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setSavedBanner(null);

    try {
      if (mode === 'summary') {
        const res = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            courseCode,
            contentText,
            fileDataUrl,
            fileMimeType,
            focusMode,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Summarization failed.');
        setSummaryResult(data.summary);
      } else if (mode === 'quiz') {
        const res = await fetch('/api/ai/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            courseCode,
            contentText,
            fileDataUrl,
            fileMimeType,
            questionCount,
            difficulty,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Quiz generation failed.');
        setQuizTitle(data.quizTitle || title || 'Practice Quiz');
        setQuestions(data.questions || []);
        setAnswers({});
        setQuizSubmitted(false);
      } else {
        const res = await fetch('/api/ai/flashcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            courseCode,
            contentText,
            fileDataUrl,
            fileMimeType,
            cardCount: 8,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Flashcards generation failed.');
        setCards(data.cards || []);
        setCardIdx(0);
        setCardFlipped(false);
        setShowHint(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI request failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitQuiz = async () => {
    setQuizSubmitted(true);
    if (!user || questions.length === 0) return;

    const correctCount = questions.reduce((acc, q, idx) => {
      return acc + (answers[idx] === q.correctIndex ? 1 : 0);
    }, 0);
    const pct = Math.round((correctCount / questions.length) * 100);

    try {
      await addDoc(collection(db, 'users', user.uid, 'quizAttempts'), {
        ownerId: user.uid,
        title: clampString(quizTitle || title || 'AI Retention Quiz', 180),
        courseCode: normalizeCourseCode(courseCode || 'GENERAL') || 'GENERAL',
        score: pct,
        totalQuestions: questions.length,
        createdAt: serverTimestamp(),
      });
      setSavedBanner(`Quiz score (${pct}%) saved to your Progress Tracker.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/quizAttempts`);
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

  const correctTotal = questions.reduce(
    (acc, q, idx) => acc + (answers[idx] === q.correctIndex ? 1 : 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            AI Study Studio
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Summarize dense lecture notes, generate active-recall quizzes with instant grading, and drill flashcards.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { id: 'summary', label: 'Note Summarizer' },
            { id: 'quiz', label: 'Retention Quiz' },
            { id: 'flashcards', label: 'Flashcards' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id as typeof mode)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === tab.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Input Source Column */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Source Material
          </h2>

          {(materials.length > 0 || pastQuestions.length > 0) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Load from Shared Library (Materials &amp; Past Papers)
              </label>
              <select
                defaultValue=""
                onChange={(e) => handleLoadSavedMaterial(e.target.value)}
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
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Upload PDF, Image or Text Notes
              </label>
              {fileName && <span className="text-xs text-emerald-600 dark:text-emerald-400">{fileName}</span>}
            </div>
            <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <Upload className="h-3.5 w-3.5" />
              <span>Attach file (.txt, .md, .pdf, image)</span>
              <input
                type="file"
                accept=".txt,.md,.pdf,image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Paste Lecture Notes or Textbook Excerpt
            </label>
            <textarea
              rows={8}
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              placeholder="Paste your lecture notes, slide bullets, or study readings here..."
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
                  Questions
                </label>
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value={5}>5 Questions</option>
                  <option value={8}>8 Questions</option>
                  <option value={10}>10 Questions</option>
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

          {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
          {savedBanner && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{savedBanner}</p>}

          <button
            type="button"
            disabled={generating || (!contentText.trim() && !fileDataUrl)}
            onClick={handleGenerate}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {generating
              ? 'Generating with AI...'
              : mode === 'summary'
              ? 'Summarize Notes'
              : mode === 'quiz'
              ? 'Generate Practice Quiz'
              : 'Generate Flashcard Deck'}
          </button>
        </div>

        {/* Output Workspace Column */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          {mode === 'summary' && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Generated Study Summary
                </h2>
                {summaryResult && (
                  <button
                    type="button"
                    disabled={savingMaterial}
                    onClick={handleSaveSummaryToLibrary}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {savingMaterial ? 'Saving...' : 'Save to Course Library'}
                  </button>
                )}
              </div>

              {summaryResult ? (
                <div className="mt-4">
                  <MarkdownView content={summaryResult} />
                </div>
              ) : (
                <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                  Paste your notes or select a course material on the left, then click Summarize Notes.
                </div>
              )}
            </>
          )}

          {mode === 'quiz' && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    {quizTitle || 'Interactive Retention Quiz'}
                  </h2>
                  {quizSubmitted && questions.length > 0 && (
                    <p className="mt-0.5 font-mono text-xs font-semibold text-blue-700 tabular-nums dark:text-blue-400">
                      Score: {correctTotal} / {questions.length} ({Math.round((correctTotal / questions.length) * 100)}%)
                    </p>
                  )}
                </div>

                {questions.length > 0 && !quizSubmitted && (
                  <button
                    type="button"
                    onClick={handleSubmitQuiz}
                    className="rounded-lg bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    Grade &amp; Save Score
                  </button>
                )}
              </div>

              {questions.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                  Generate a quiz from any lecture note or past paper to test retention and log scores to your Progress page.
                </div>
              ) : (
                <div className="mt-4 space-y-6">
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

              {cards.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                  Generate a flashcard deck from your notes to practice active recall before exams.
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  <button
                    type="button"
                    onClick={() => setCardFlipped((f) => !f)}
                    className="flex min-h-[240px] w-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 text-center transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-600"
                  >
                    <span className="text-xs font-medium text-slate-400">
                      {cardFlipped ? 'Answer (click to flip back)' : 'Prompt (click to reveal answer)'}
                    </span>
                    <p className="mt-4 max-w-lg font-display text-lg font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                      {cardFlipped ? cards[cardIdx].back : cards[cardIdx].front}
                    </p>
                  </button>

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
