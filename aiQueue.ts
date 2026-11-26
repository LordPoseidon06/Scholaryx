import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeneratedFlashcard, GeneratedQuizQuestion } from '../types';
import { classifyAiError, parseAiResponse } from './utils';

export type AiStudioMode = 'summary' | 'quiz' | 'flashcards';

export type AiQueueItemStatus =
  | 'running'
  | 'waiting'
  | 'paused_offline'
  | 'paused_limit';

export interface AiStudioJobPayload {
  title: string;
  courseCode: string;
  contentText: string;
  fileDataUrl?: string;
  fileMimeType?: string;
  fileName?: string;
  focusMode?: 'standard' | 'exam' | 'brief';
  questionCount?: number;
  difficulty?: string;
  cardCount?: number;
  hadOmittedLargeAttachment?: boolean;
}

export interface AiStudioQueueItem {
  id: string;
  mode: AiStudioMode;
  label: string;
  courseCode: string;
  payload: AiStudioJobPayload;
  status: AiQueueItemStatus;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: number | null;
  lastError: string | null;
  lastReason?: 'offline' | 'busy' | 'rate_limit' | 'timeout' | 'network' | 'non_retryable';
  createdAt: number;
}

export type AiStudioJobResult =
  | { mode: 'summary'; summary: string }
  | { mode: 'quiz'; quizTitle: string; questions: GeneratedQuizQuestion[] }
  | { mode: 'flashcards'; cards: GeneratedFlashcard[] };

const STORAGE_PREFIX = 'scholaryx_ai_queue_';
const MAX_AUTO_ATTEMPTS = 5;
const BACKOFF_STEPS_MS = [4_000, 8_000, 14_000, 22_000, 32_000];
const MAX_PERSISTED_DATA_URL_CHARS = 180_000;

function computeBackoffMs(attempt: number, serverHintMs?: number): number {
  const idx = Math.max(0, Math.min(BACKOFF_STEPS_MS.length - 1, attempt - 1));
  const base = BACKOFF_STEPS_MS[idx];
  const jitter = Math.round(Math.random() * 1_200);
  return Math.max(base + jitter, serverHintMs ?? 0);
}

function getStorageKey(uid?: string): string {
  return `${STORAGE_PREFIX}${uid || 'anon'}`;
}

function loadPersistedQueue(uid?: string): AiStudioQueueItem[] {
  if (!uid || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AiStudioQueueItem[];
    if (!Array.isArray(parsed)) return [];
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return parsed
      .filter((item) => item && item.id && item.mode && item.payload)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        status: offline ? 'paused_offline' : 'waiting',
        nextRetryAt: offline ? null : Date.now() + 1_500,
      }));
  } catch {
    return [];
  }
}

function persistQueue(uid: string | undefined, items: AiStudioQueueItem[]): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(getStorageKey(uid));
      return;
    }
    const serializable = items.slice(0, 10).map((item) => {
      const dataUrl = item.payload.fileDataUrl || '';
      const omitDataUrl = dataUrl.length > MAX_PERSISTED_DATA_URL_CHARS;
      return {
        ...item,
        status: item.status === 'running' ? 'waiting' : item.status,
        payload: {
          ...item.payload,
          fileDataUrl: omitDataUrl ? '' : dataUrl,
          hadOmittedLargeAttachment:
            omitDataUrl || Boolean(item.payload.hadOmittedLargeAttachment),
        },
      };
    });
    window.localStorage.setItem(getStorageKey(uid), JSON.stringify(serializable));
  } catch {
    // Ignore localStorage quota failures cleanly
  }
}

async function executeAiStudioJob(
  item: AiStudioQueueItem,
  signal: AbortSignal
): Promise<AiStudioJobResult> {
  const { mode, payload } = item;

  if (
    item.payload.hadOmittedLargeAttachment &&
    !payload.fileDataUrl &&
    !payload.contentText.trim()
  ) {
    throw new Error(
      `Attachment "${payload.fileName || 'file'}" was too large to store across browser reload. Re-attach the file and retry.`
    );
  }

  if (mode === 'summary') {
    const res = await fetch('/api/ai/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        title: payload.title,
        courseCode: payload.courseCode,
        contentText: payload.contentText,
        fileDataUrl: payload.fileDataUrl,
        fileMimeType: payload.fileMimeType,
        fileName: payload.fileName,
        focusMode: payload.focusMode || 'standard',
      }),
    });
    const data = await parseAiResponse<{ summary?: string }>(res, 'Summarization failed.');
    if (!data.summary) throw new Error('AI returned an empty summary.');
    return { mode: 'summary', summary: data.summary };
  }

  if (mode === 'quiz') {
    const res = await fetch('/api/ai/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        title: payload.title,
        courseCode: payload.courseCode,
        contentText: payload.contentText,
        fileDataUrl: payload.fileDataUrl,
        fileMimeType: payload.fileMimeType,
        fileName: payload.fileName,
        questionCount: payload.questionCount || 10,
        difficulty: payload.difficulty || 'Exam Standard',
      }),
    });
    const data = await parseAiResponse<{
      quizTitle?: string;
      questions?: GeneratedQuizQuestion[];
    }>(res, 'Quiz generation failed.');
    if (!data.questions || data.questions.length === 0) {
      throw new Error(
        'Could not build quiz questions from this input. Try adding more detailed notes.'
      );
    }
    return {
      mode: 'quiz',
      quizTitle: data.quizTitle || payload.title || 'Practice Quiz',
      questions: data.questions,
    };
  }

  const res = await fetch('/api/ai/flashcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      title: payload.title,
      courseCode: payload.courseCode,
      contentText: payload.contentText,
      fileDataUrl: payload.fileDataUrl,
      fileMimeType: payload.fileMimeType,
      fileName: payload.fileName,
      cardCount: payload.cardCount || 8,
    }),
  });
  const data = await parseAiResponse<{ cards?: GeneratedFlashcard[] }>(
    res,
    'Flashcards generation failed.'
  );
  if (!data.cards || data.cards.length === 0) {
    throw new Error(
      'Could not build flashcards from this input. Try adding more detailed notes.'
    );
  }
  return { mode: 'flashcards', cards: data.cards };
}

export function useAiStudioQueue({
  uid,
  onSuccess,
  onFatalError,
}: {
  uid?: string;
  onSuccess: (job: AiStudioQueueItem, result: AiStudioJobResult) => void;
  onFatalError: (job: AiStudioQueueItem, message: string) => void;
}) {
  const [queue, setQueue] = useState<AiStudioQueueItem[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  const queueRef = useRef<AiStudioQueueItem[]>(queue);
  const runningJobIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onFatalErrorRef = useRef(onFatalError);

  onSuccessRef.current = onSuccess;
  onFatalErrorRef.current = onFatalError;

  const updateQueue = useCallback(
    (updater: (prev: AiStudioQueueItem[]) => AiStudioQueueItem[]) => {
      setQueue((prev) => {
        const next = updater(prev);
        queueRef.current = next;
        persistQueue(uid, next);
        return next;
      });
    },
    [uid]
  );

  // Restore any queued items from localStorage for this user
  useEffect(() => {
    const restored = loadPersistedQueue(uid);
    queueRef.current = restored;
    setQueue(restored);
  }, [uid]);

  const pumpQueue = useCallback(async () => {
    if (runningJobIdRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const now = Date.now();
    const nextJob = queueRef.current.find(
      (item) =>
        item.status === 'waiting' && (item.nextRetryAt === null || item.nextRetryAt <= now)
    );
    if (!nextJob) return;

    runningJobIdRef.current = nextJob.id;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    updateQueue((prev) =>
      prev.map((item) =>
        item.id === nextJob.id
          ? { ...item, status: 'running', nextRetryAt: null }
          : item
      )
    );

    try {
      const result = await executeAiStudioJob(nextJob, controller.signal);
      // Only apply result if job was not manually cancelled while running
      const stillPresent = queueRef.current.some((item) => item.id === nextJob.id);
      if (stillPresent) {
        updateQueue((prev) => prev.filter((item) => item.id !== nextJob.id));
        onSuccessRef.current(nextJob, result);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const stillPresent = queueRef.current.some((item) => item.id === nextJob.id);
      if (!stillPresent) return;

      const classified = classifyAiError(err);
      if (!classified.retryable) {
        updateQueue((prev) => prev.filter((item) => item.id !== nextJob.id));
        onFatalErrorRef.current(nextJob, classified.message);
      } else if (classified.reason === 'offline') {
        updateQueue((prev) =>
          prev.map((item) =>
            item.id === nextJob.id
              ? {
                  ...item,
                  status: 'paused_offline',
                  nextRetryAt: null,
                  lastError: classified.message,
                  lastReason: classified.reason,
                }
              : item
          )
        );
      } else if (nextJob.attempt < nextJob.maxAttempts) {
        const delayMs = computeBackoffMs(nextJob.attempt, classified.retryAfterMs);
        updateQueue((prev) =>
          prev.map((item) =>
            item.id === nextJob.id
              ? {
                  ...item,
                  status: 'waiting',
                  attempt: item.attempt + 1,
                  nextRetryAt: Date.now() + delayMs,
                  lastError: classified.message,
                  lastReason: classified.reason,
                }
              : item
          )
        );
      } else {
        updateQueue((prev) =>
          prev.map((item) =>
            item.id === nextJob.id
              ? {
                  ...item,
                  status: 'paused_limit',
                  nextRetryAt: null,
                  lastError: classified.message,
                  lastReason: classified.reason,
                }
              : item
          )
        );
      }
    } finally {
      if (runningJobIdRef.current === nextJob.id) {
        runningJobIdRef.current = null;
        abortControllerRef.current = null;
      }
    }
  }, [updateQueue]);

  // 1-second timer to update countdowns and dispatch due queued jobs
  useEffect(() => {
    const hasPending = queue.some((item) => item.status === 'waiting');
    if (!hasPending) return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      const due = queueRef.current.some(
        (item) =>
          item.status === 'waiting' && (item.nextRetryAt === null || item.nextRetryAt <= now)
      );
      if (due) {
        void pumpQueue();
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [queue, pumpQueue]);

  // Trigger pump immediately whenever queue adds an immediately-due item
  useEffect(() => {
    const now = Date.now();
    const due = queue.some(
      (item) =>
        item.status === 'waiting' && (item.nextRetryAt === null || item.nextRetryAt <= now)
    );
    if (due) {
      void pumpQueue();
    }
  }, [queue, pumpQueue]);

  // Automatically resume offline or waiting requests when connection/tab returns
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNowMs(Date.now());
      updateQueue((prev) =>
        prev.map((item) =>
          item.status === 'paused_offline' || item.status === 'paused_limit'
            ? {
                ...item,
                status: 'waiting',
                attempt: item.status === 'paused_limit' ? 1 : item.attempt,
                nextRetryAt: Date.now(),
              }
            : item.status === 'waiting'
            ? { ...item, nextRetryAt: Date.now() }
            : item
        )
      );
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void pumpQueue();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [updateQueue, pumpQueue]);

  // Abort in-flight request only on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const enqueue = useCallback(
    (mode: AiStudioMode, payload: AiStudioJobPayload) => {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const newJob: AiStudioQueueItem = {
        id: `${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        mode,
        label: payload.title.trim() || payload.courseCode.trim() || 'Study Notes',
        courseCode: payload.courseCode.trim(),
        payload,
        status: offline ? 'paused_offline' : 'waiting',
        attempt: 1,
        maxAttempts: MAX_AUTO_ATTEMPTS,
        nextRetryAt: offline ? null : Date.now(),
        lastError: offline
          ? 'You are offline. Queued to run automatically once your connection returns.'
          : null,
        lastReason: offline ? 'offline' : undefined,
        createdAt: Date.now(),
      };

      updateQueue((prev) => {
        // Keep running job untouched; replace any pending waiting/paused job for the same mode
        const filtered = prev.filter(
          (item) => item.mode !== mode || item.status === 'running'
        );
        return [...filtered, newJob];
      });
      setNowMs(Date.now());
    },
    [updateQueue]
  );

  const retryNow = useCallback(
    (jobId: string) => {
      setNowMs(Date.now());
      updateQueue((prev) =>
        prev.map((item) =>
          item.id === jobId
            ? {
                ...item,
                status: 'waiting',
                attempt: item.status === 'paused_limit' ? 1 : item.attempt,
                nextRetryAt: Date.now(),
              }
            : item
        )
      );
    },
    [updateQueue]
  );

  const cancelJob = useCallback(
    (jobId: string) => {
      if (runningJobIdRef.current === jobId) {
        abortControllerRef.current?.abort();
        runningJobIdRef.current = null;
        abortControllerRef.current = null;
      }
      updateQueue((prev) => prev.filter((item) => item.id !== jobId));
    },
    [updateQueue]
  );

  const clearQueuedNonRunning = useCallback(() => {
    updateQueue((prev) => prev.filter((item) => item.status === 'running'));
  }, [updateQueue]);

  return {
    queue,
    nowMs,
    isOnline,
    enqueue,
    retryNow,
    cancelJob,
    clearQueuedNonRunning,
  };
}
