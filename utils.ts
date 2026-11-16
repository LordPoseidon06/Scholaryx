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
  extractedText?: string;
  fileDataUrl?: string;
}

const MAX_BINARY_DATA_URL_CHARS = 680000;

export async function readStudyFile(file: File): Promise<ParsedUploadResult> {
  const name = file.name.slice(0, 180);
  const mime = (file.type || 'application/octet-stream').slice(0, 100);

  const isTextLike =
    mime.startsWith('text/') ||
    /\.(txt|md|markdown|csv|json|py|ts|tsx|js|java|c|cpp|sql|tex)$/i.test(file.name);

  if (isTextLike) {
    const text = await file.text();
    return {
      fileName: name,
      fileMimeType: mime || 'text/plain',
      extractedText: text.slice(0, 50000),
    };
  }

  // Binary PDF or image: convert to base64 Data URL within Firestore 1MB safety budget
  if (file.size > 480 * 1024) {
    throw new Error(
      'Binary files (PDF/images) must be under 480 KB for direct storage, or paste extracted text / add a cloud link.'
    );
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });

  if (dataUrl.length > MAX_BINARY_DATA_URL_CHARS) {
    throw new Error('Encoded file exceeds the 680 KB document storage budget. Try a smaller file or paste text.');
  }

  return {
    fileName: name,
    fileMimeType: mime,
    fileDataUrl: dataUrl,
  };
}
