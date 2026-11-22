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
  const mime = (file.type || 'application/octet-stream').slice(0, 100);

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
      fileMimeType: mime || 'text/plain',
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

export async function parseAiResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (res.status === 413) {
    throw new Error(
      'This attachment exceeds the 4.5 MB serverless request limit. Paste key text excerpts or use a smaller PDF/image (under 3 MB).'
    );
  }
  if (res.status === 504) {
    throw new Error(
      'The AI request timed out on the server. Try fewer quiz questions or a shorter excerpt.'
    );
  }

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (res.status === 404) {
        throw new Error(
          'AI backend endpoint was not found (HTTP 404). Make sure /api functions and GEMINI_API_KEY are deployed.'
        );
      }
      const snippet = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
      if (!res.ok) {
        throw new Error(
          `${fallbackMessage} (HTTP ${res.status}${snippet ? `: ${snippet}` : ''})`
        );
      }
      throw new Error(
        `Unexpected non-JSON response from AI service (HTTP ${res.status}${snippet ? `: ${snippet}` : ''}).`
      );
    }
  }

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' && data.error ? data.error : fallbackMessage);
  }
  return data as T;
}

