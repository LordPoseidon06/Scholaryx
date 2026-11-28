export function normalizeCourseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '').slice(0, 24);
}

export function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getConversationId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

export function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatReadableDate(dateStr: string): string {
  if (!dateStr) return '';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getTimestampMillis(ts: unknown): number {
  if (!ts) return Date.now();
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return 'Recent';
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ST';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export interface ParsedUploadResult {
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  extractedText?: string;
  fileDataUrl?: string;
}

export const MAX_FILE_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_INLINE_DATA_URL_CHARS = 650000;

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  tex: 'application/x-tex',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const BLOCKED_BINARY_EXTENSIONS = /\.(mp4|mov|avi|mkv|webm|mp3|wav|m4a|aac|zip|rar|7z|tar|gz|apk|exe|dmg|iso)$/i;

export function inferMimeTypeFromExtension(fileName: string, rawType?: string): string {
  const cleanRaw = (rawType || '').trim().toLowerCase();
  if (cleanRaw && cleanRaw !== 'application/octet-stream' && cleanRaw !== 'binary/octet-stream') {
    return cleanRaw.slice(0, 100);
  }
  const extMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (extMatch) {
    const mapped = EXTENSION_MIME_MAP[extMatch[1]];
    if (mapped) return mapped;
  }
  return cleanRaw || 'application/octet-stream';
}

export function isPdfAttachment(opts: {
  fileMimeType?: string;
  fileName?: string;
  dataUrl?: string;
}): boolean {
  const mime = (opts.fileMimeType || '').toLowerCase();
  const name = (opts.fileName || '').toLowerCase();
  const url = (opts.dataUrl || '').toLowerCase();
  return (
    mime === 'application/pdf' ||
    name.endsWith('.pdf') ||
    url.startsWith('data:application/pdf')
  );
}

export function getGhanaAcademicStanding(averagePct: number): {
  label: string;
  toneClass: string;
} {
  if (averagePct >= 70) {
    return { label: 'First Class Standing', toneClass: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (averagePct >= 60) {
    return { label: 'Second Class Upper', toneClass: 'text-blue-700 dark:text-blue-400' };
  }
  if (averagePct >= 50) {
    return { label: 'Second Class Lower', toneClass: 'text-indigo-600 dark:text-indigo-400' };
  }
  if (averagePct >= 40) {
    return { label: 'Pass Standing', toneClass: 'text-amber-600 dark:text-amber-400' };
  }
  return { label: 'Needs Support (< 40%)', toneClass: 'text-rose-600 dark:text-rose-400' };
}

export function computeStudyStreak(loggedDates: string[]): number {
  const validDates = new Set(loggedDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  if (validDates.size === 0) return 0;

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (!validDates.has(toIso(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!validDates.has(toIso(cursor))) return 0;
  }

  let streak = 0;
  while (validDates.has(toIso(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

export async function readStudyFile(file: File): Promise<ParsedUploadResult> {
  const name = file.name.slice(0, 180);
  if (BLOCKED_BINARY_EXTENSIONS.test(name)) {
    throw new Error(
      'Please choose a study document (PDF, PowerPoint, Word, Text, Markdown) or an image of lecture slides.'
    );
  }

  const mime = inferMimeTypeFromExtension(name, file.type);

  if (file.size > MAX_FILE_UPLOAD_BYTES) {
    throw new Error(
      `File exceeds the 100 MB limit (${formatFileSize(file.size)} selected). Choose a file up to 100 MB.`
    );
  }

  const isTextLike =
    mime.startsWith('text/') ||
    /\.(txt|md|markdown|csv|json|py|ts|tsx|js|java|c|cpp|sql|tex)$/i.test(file.name);

  if (isTextLike) {
    const previewSlice = file.size > 200000 ? file.slice(0, 200000) : file;
    const text = await previewSlice.text();
    const extractedText = text.slice(0, 50000);
    // Keep full Data URL for download/AI when text exceeds the inline preview cap
    const fileDataUrl = file.size > 50000 ? await readAsDataUrl(file) : undefined;
    return {
      fileName: name,
      fileMimeType: mime === 'application/octet-stream' ? 'text/plain' : mime,
      fileSizeBytes: file.size,
      extractedText,
      fileDataUrl,
    };
  }

  const dataUrl = await readAsDataUrl(file);
  return {
    fileName: name,
    fileMimeType: mime,
    fileSizeBytes: file.size,
    fileDataUrl: dataUrl,
  };
}

export class AiHttpError extends Error {
  status: number;
  retryable: boolean;
  retryAfterMs?: number;

  constructor(
    message: string,
    options: { status: number; retryable: boolean; retryAfterMs?: number }
  ) {
    super(message);
    this.name = 'AiHttpError';
    this.status = options.status;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function classifyAiError(err: unknown): {
  message: string;
  retryable: boolean;
  reason: 'offline' | 'busy' | 'rate_limit' | 'timeout' | 'network' | 'non_retryable';
  retryAfterMs?: number;
} {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      message: 'Connection lost. Your request is queued and will retry automatically when back online.',
      retryable: true,
      reason: 'offline',
    };
  }

  if (err instanceof AiHttpError) {
    const reason =
      err.status === 429
        ? 'rate_limit'
        : err.status === 504
        ? 'timeout'
        : err.retryable
        ? 'busy'
        : 'non_retryable';
    return {
      message: err.message,
      retryable: err.retryable,
      reason,
      retryAfterMs: err.retryAfterMs,
    };
  }

  const msg = err instanceof Error ? err.message : String(err || 'AI request failed.');
  const lower = msg.toLowerCase();

  if (
    err instanceof TypeError ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('load failed')
  ) {
    return {
      message: 'Temporary connection drop. Your request is queued and will retry automatically.',
      retryable: true,
      reason: 'network',
    };
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return {
      message: msg,
      retryable: true,
      reason: 'timeout',
    };
  }

  if (
    lower.includes('too many') ||
    lower.includes('rate limit') ||
    lower.includes('quota')
  ) {
    return {
      message: msg,
      retryable: true,
      reason: 'rate_limit',
    };
  }

  if (
    lower.includes('busy') ||
    lower.includes('temporarily') ||
    lower.includes('high demand') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('capacity')
  ) {
    return {
      message: msg,
      retryable: true,
      reason: 'busy',
    };
  }

  return {
    message: msg,
    retryable: false,
    reason: 'non_retryable',
  };
}

function parseRetryAfterHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(45_000, Math.round(seconds * 1000));
  }
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    if (delta > 0) return Math.min(45_000, delta);
  }
  return undefined;
}

export async function parseAiResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const retryAfterMs = parseRetryAfterHeader(res.headers.get('Retry-After'));

  if (res.status === 413) {
    throw new AiHttpError(
      'This attachment exceeds the 4.5 MB serverless request limit. Paste key text excerpts or use a smaller PDF/image (under 3 MB).',
      { status: 413, retryable: false }
    );
  }
  if (res.status === 504) {
    throw new AiHttpError(
      'The AI request timed out on the server. Queued to retry automatically.',
      { status: 504, retryable: true, retryAfterMs }
    );
  }

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (res.status === 404) {
        throw new AiHttpError(
          'AI backend endpoint was not found (HTTP 404). Make sure /api functions and GEMINI_API_KEY are deployed.',
          { status: 404, retryable: false }
        );
      }
      const snippet = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
      const isTransientStatus = [429, 500, 502, 503, 504].includes(res.status);
      if (!res.ok) {
        throw new AiHttpError(
          `${fallbackMessage} (HTTP ${res.status}${snippet ? `: ${snippet}` : ''})`,
          { status: res.status, retryable: isTransientStatus, retryAfterMs }
        );
      }
      throw new AiHttpError(
        `Unexpected non-JSON response from AI service (HTTP ${res.status}${snippet ? `: ${snippet}` : ''}).`,
        { status: res.status || 502, retryable: true, retryAfterMs }
      );
    }
  }

  if (!res.ok) {
    const message = typeof data.error === 'string' && data.error ? data.error : fallbackMessage;
    const isTransientStatus = [429, 500, 502, 503, 504].includes(res.status);
    throw new AiHttpError(message, {
      status: res.status,
      retryable: isTransientStatus,
      retryAfterMs,
    });
  }
  return data as T;
}

