import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import JSZip from 'jszip';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const PUBLIC_API_FALLBACK_MODEL = 'gemini-2.5-flash';
const PUBLIC_API_LITE_FALLBACK_MODEL = 'gemini-2.5-flash-lite';
const INLINE_BINARY_CHAR_LIMIT = 16_000_000; // ~12 MB binary -> use Gemini Files API above this

export interface AiHandlerResult {
  status: number;
  data: Record<string, unknown>;
}

export interface NodeReqLike {
  method?: string;
  body?: unknown;
  on?: (event: string, listener: (chunk: Buffer | string) => void) => void;
}

export interface NodeResLike {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
}

export function getConfiguredApiKey(): string | null {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (!key || key === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return key;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = getConfiguredApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add GEMINI_API_KEY in Vercel Settings -> Environment Variables (or Settings -> Secrets in AI Studio) and redeploy.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseApiError(error: unknown): {
  status: number;
  message: string;
  retryable: boolean;
  modelNotFound: boolean;
} {
  const fallback = {
    status: 500,
    message: 'AI request failed. Please try again.',
    retryable: false,
    modelNotFound: false,
  };

  if (!error) return fallback;

  let rawMessage = error instanceof Error ? error.message : String(error);
  let status =
    typeof (error as { status?: number })?.status === 'number'
      ? (error as { status: number }).status
      : 500;

  for (let depth = 0; depth < 3; depth++) {
    const trimmed = rawMessage.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as {
          error?: { code?: number; message?: string; status?: string };
          message?: string;
          code?: number;
        };
        if (parsed.error) {
          if (typeof parsed.error.code === 'number') status = parsed.error.code;
          if (parsed.error.message) {
            rawMessage = parsed.error.message;
            continue;
          }
        } else if (parsed.message) {
          if (typeof parsed.code === 'number') status = parsed.code;
          rawMessage = parsed.message;
          continue;
        }
      } catch {
        break;
      }
    }
    break;
  }

  const lower = rawMessage.toLowerCase();
  const modelNotFound =
    status === 404 ||
    lower.includes('not found') ||
    lower.includes('is not supported for generatecontent') ||
    lower.includes('unknown model') ||
    lower.includes('invalid model') ||
    lower.includes('model not found') ||
    (status === 400 && lower.includes('thinking'));

  const isTimeout =
    (error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')) ||
    lower.includes('timeout') ||
    lower.includes('aborted');

  const retryable =
    modelNotFound ||
    isTimeout ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 429 ||
    lower.includes('high demand') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('internal') ||
    lower.includes('empty response') ||
    lower.includes('temporarily');

  if (status === 503 || lower.includes('high demand') || lower.includes('unavailable')) {
    return {
      status: 503,
      message: 'The AI study engine is temporarily busy. Please try again in a few seconds.',
      retryable: true,
      modelNotFound: false,
    };
  }

  if (status === 429 || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      status: 429,
      message: 'Too many AI requests right now. Wait a few seconds and try again.',
      retryable: true,
      modelNotFound: false,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api key') ||
    lower.includes('api_key') ||
    lower.includes('permission') ||
    lower.includes('gemini_api_key')
  ) {
    return {
      status: 403,
      message: rawMessage.includes('GEMINI_API_KEY')
        ? rawMessage
        : 'Gemini API key is missing or unauthorized. Check GEMINI_API_KEY in your environment variables.',
      retryable: false,
      modelNotFound: false,
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: rawMessage || fallback.message,
    retryable,
    modelNotFound,
  };
}

type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { fileUri: string; mimeType: string } };

type ThinkingPreference = 'high' | 'medium' | 'low';

interface ModelAttempt {
  model: string;
  thinking?: ThinkingPreference | 'none';
  delayMs: number;
  skipOnNotFound?: boolean;
}

function supportsThinkingLevel(model: string): boolean {
  return model.startsWith('gemini-4') || model.startsWith('gemini-3');
}

function toThinkingEnum(pref: ThinkingPreference): ThinkingLevel {
  if (pref === 'high') return ThinkingLevel.HIGH;
  if (pref === 'low') return ThinkingLevel.LOW;
  return ThinkingLevel.MEDIUM;
}

function withJitter(baseMs: number): number {
  return Math.round(baseMs + Math.random() * Math.min(450, baseMs * 0.4));
}

async function generateWithRetryAndFallback(
  ai: GoogleGenAI,
  request: {
    contents: { parts: GeminiContentPart[] };
    config?: Record<string, unknown>;
    timeoutMs?: number;
    maxTotalMs?: number;
    thinkingLevel?: ThinkingPreference;
  }
) {
  const customModel = process.env.GEMINI_MODEL?.trim();
  const preferredThinking: ThinkingPreference = request.thinkingLevel ?? 'medium';

  const attempts: ModelAttempt[] = [
    ...(customModel
      ? [{ model: customModel, thinking: preferredThinking, delayMs: 0 }]
      : []),
    { model: PRIMARY_MODEL, thinking: preferredThinking, delayMs: 0, skipOnNotFound: true },
    {
      model: PRIMARY_MODEL,
      thinking: preferredThinking === 'high' ? 'medium' : 'low',
      delayMs: 650,
      skipOnNotFound: true,
    },
    { model: FALLBACK_MODEL, thinking: 'low', delayMs: 450, skipOnNotFound: true },
    { model: PUBLIC_API_FALLBACK_MODEL, thinking: 'none', delayMs: 450, skipOnNotFound: true },
    { model: PUBLIC_API_LITE_FALLBACK_MODEL, thinking: 'none', delayMs: 550, skipOnNotFound: true },
    { model: PRIMARY_MODEL, thinking: 'low', delayMs: 1200, skipOnNotFound: true },
  ];

  let lastError: unknown;
  const unavailableModels = new Set<string>();
  const startedAt = Date.now();
  const maxTotalMs = request.maxTotalMs ?? 52_000;
  const baseTimeoutMs = request.timeoutMs ?? 24_000;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.skipOnNotFound && unavailableModels.has(attempt.model)) {
      continue;
    }

    const elapsed = Date.now() - startedAt;
    const remainingBudget = maxTotalMs - elapsed;
    if (remainingBudget < 3_000) {
      break;
    }

    if (attempt.delayMs > 0 && i > 0) {
      const waitMs = Math.min(withJitter(attempt.delayMs), Math.max(0, remainingBudget - 4_000));
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }

    const attemptTimeoutMs = Math.max(
      4_500,
      Math.min(baseTimeoutMs, maxTotalMs - (Date.now() - startedAt) - 500)
    );

    try {
      const config: Record<string, unknown> = { ...(request.config || {}) };
      if (attempt.thinking && attempt.thinking !== 'none' && supportsThinkingLevel(attempt.model)) {
        config.thinkingConfig = { thinkingLevel: toThinkingEnum(attempt.thinking) };
      } else {
        delete config.thinkingConfig;
      }

      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        config.abortSignal = AbortSignal.timeout(attemptTimeoutMs);
      }

      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: request.contents,
        config,
      });

      if (response.text && response.text.trim()) {
        return response;
      }
      lastError = new Error('Empty response received from AI.');
    } catch (err) {
      lastError = err;
      const parsed = parseApiError(err);
      const rawMsg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

      if (parsed.modelNotFound) {
        if (!rawMsg.includes('thinking')) {
          unavailableModels.add(attempt.model);
        } else if (supportsThinkingLevel(attempt.model)) {
          // Retry same model once without thinkingConfig if thinking config triggered 400
          try {
            const strippedConfig: Record<string, unknown> = { ...(request.config || {}) };
            delete strippedConfig.thinkingConfig;
            if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
              strippedConfig.abortSignal = AbortSignal.timeout(attemptTimeoutMs);
            }
            const fallbackResp = await ai.models.generateContent({
              model: attempt.model,
              contents: request.contents,
              config: strippedConfig,
            });
            if (fallbackResp.text && fallbackResp.text.trim()) {
              return fallbackResp;
            }
          } catch (innerErr) {
            lastError = innerErr;
          }
        }
        continue;
      }

      const isTimeout =
        (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) ||
        rawMsg.includes('timeout') ||
        rawMsg.includes('aborted');

      if (isTimeout) {
        // Move straight to next lighter/faster model without throwing prematurely
        continue;
      }

      if (!parsed.retryable) {
        throw err;
      }
    }
  }

  throw lastError;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

async function extractOfficeText(base64Data: string, kind: 'docx' | 'pptx'): Promise<string> {
  const buffer = Buffer.from(base64Data, 'base64');
  const zip = await JSZip.loadAsync(buffer);

  if (kind === 'docx') {
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) return '';
    const withBreaks = docXml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<[^>]+>/g, '');
    return decodeXmlEntities(withBreaks)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const numB = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return numA - numB;
    });

  const slideTexts: string[] = [];
  for (const slidePath of slideFiles) {
    const xml = await zip.file(slidePath)?.async('string');
    if (!xml) continue;
    const matches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) =>
      decodeXmlEntities(m[1])
    );
    const cleaned = matches.join(' ').replace(/\s+/g, ' ').trim();
    if (cleaned) {
      const slideNum = slidePath.match(/slide(\d+)\.xml/i)?.[1] || '';
      slideTexts.push(`[Slide ${slideNum}]\n${cleaned}`);
    }
  }

  return slideTexts.join('\n\n').trim();
}

function inferMimeType(rawMime: string, fallbackMime?: string, fileName?: string): string {
  const lowerName = (fileName || '').toLowerCase();
  if (rawMime && rawMime !== 'application/octet-stream') {
    return rawMime;
  }
  if (fallbackMime && fallbackMime !== 'application/octet-stream') {
    return fallbackMime;
  }
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.gif')) return 'image/gif';
  if (lowerName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lowerName.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (lowerName.endsWith('.doc')) return 'application/msword';
  if (lowerName.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (/\.(txt|md|markdown|csv|json|tex|py|ts|tsx|js|java|c|cpp|sql)$/i.test(lowerName)) {
    return 'text/plain';
  }
  return rawMime || 'application/octet-stream';
}

function stripSyntheticPlaceholder(text: string): string {
  const trimmed = text.trim();
  if (/^(Uploaded resource|Attached file):\s.+$/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

interface PreparedMaterial {
  textContent: string;
  mediaPart: GeminiContentPart | null;
  uploadedFileName?: string;
  unsupportedReason?: string;
}

async function prepareMaterialInput(
  ai: GoogleGenAI,
  input: {
    contentText?: string;
    fileDataUrl?: string;
    fileMimeType?: string;
    fileName?: string;
  }
): Promise<PreparedMaterial> {
  const userText = stripSyntheticPlaceholder(input.contentText || '');
  let extractedFromFile = '';
  let mediaPart: GeminiContentPart | null = null;
  let uploadedFileName: string | undefined;

  if (input.fileDataUrl && typeof input.fileDataUrl === 'string') {
    const match = input.fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mimeType = inferMimeType(match[1], input.fileMimeType, input.fileName);
      const data = match[2];
      const lowerName = (input.fileName || '').toLowerCase();

      if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerName.endsWith('.docx')
      ) {
        extractedFromFile = await extractOfficeText(data, 'docx');
        if (!extractedFromFile && !userText) {
          return {
            textContent: '',
            mediaPart: null,
            unsupportedReason: 'Could not extract readable text from this .docx document.',
          };
        }
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        lowerName.endsWith('.pptx')
      ) {
        extractedFromFile = await extractOfficeText(data, 'pptx');
        if (!extractedFromFile && !userText) {
          return {
            textContent: '',
            mediaPart: null,
            unsupportedReason:
              'This .pptx deck appears to contain only images or empty slides. Export as PDF for AI analysis.',
          };
        }
      } else if (
        mimeType === 'application/msword' ||
        mimeType === 'application/vnd.ms-powerpoint' ||
        lowerName.endsWith('.doc') ||
        lowerName.endsWith('.ppt')
      ) {
        if (!userText) {
          return {
            textContent: '',
            mediaPart: null,
            unsupportedReason:
              'Legacy binary .doc/.ppt files cannot be parsed directly. Save as .docx, .pptx, or .pdf, or paste the text.',
          };
        }
      } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        extractedFromFile = Buffer.from(data, 'base64').toString('utf-8').trim();
      } else if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
        if (data.length > INLINE_BINARY_CHAR_LIMIT) {
          const buffer = Buffer.from(data, 'base64');
          const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
          let uploaded = await ai.files.upload({
            file: blob,
            config: {
              mimeType,
              displayName: (input.fileName || 'study_material').slice(0, 120),
            },
          });
          uploadedFileName = uploaded.name;

          for (let wait = 0; wait < 15 && uploaded.state === 'PROCESSING'; wait++) {
            await sleep(1000);
            if (!uploaded.name) break;
            uploaded = await ai.files.get({ name: uploaded.name });
          }

          if (uploaded.state === 'FAILED' || !uploaded.uri) {
            throw new Error('Uploaded file could not be processed by Gemini.');
          }
          mediaPart = {
            fileData: {
              fileUri: uploaded.uri,
              mimeType: uploaded.mimeType || mimeType,
            },
          };
        } else {
          mediaPart = { inlineData: { mimeType, data } };
        }
      } else if (!userText) {
        return {
          textContent: '',
          mediaPart: null,
          unsupportedReason: `Unsupported file format (${mimeType}). Attach a PDF, image, .docx, .pptx, or text file.`,
        };
      }
    }
  }

  const combinedText = [userText, extractedFromFile]
    .filter((part, index, arr) => part && arr.indexOf(part) === index)
    .join('\n\n')
    .trim();

  return {
    textContent: combinedText,
    mediaPart,
    uploadedFileName,
  };
}

function stripJsonFences(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return cleaned;
}

function extractBalancedObjects(arrayBody: string): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;

  for (let i = 0; i < arrayBody.length; i++) {
    const ch = arrayBody[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && objStart !== -1) {
          const slice = arrayBody.slice(objStart, i + 1);
          try {
            const parsed = JSON.parse(slice) as Record<string, unknown>;
            items.push(parsed);
          } catch {
            // Skip malformed trailing object
          }
          objStart = -1;
        }
      }
    }
  }
  return items;
}

function parseJsonResponse<T>(rawText: string): T {
  const cleaned = stripJsonFences(rawText);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        // Fall through to partial recovery below
      }
    }

    // Attempt partial recovery for truncated quiz/flashcard payloads
    const titleMatch = cleaned.match(/"quizTitle"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const questionsIdx = cleaned.indexOf('"questions"');
    if (questionsIdx !== -1) {
      const bracketIdx = cleaned.indexOf('[', questionsIdx);
      if (bracketIdx !== -1) {
        const salvaged = extractBalancedObjects(cleaned.slice(bracketIdx + 1));
        if (salvaged.length > 0) {
          return {
            quizTitle: titleMatch ? titleMatch[1] : undefined,
            questions: salvaged,
          } as unknown as T;
        }
      }
    }

    const cardsIdx = cleaned.indexOf('"cards"');
    if (cardsIdx !== -1) {
      const bracketIdx = cleaned.indexOf('[', cardsIdx);
      if (bracketIdx !== -1) {
        const salvaged = extractBalancedObjects(cleaned.slice(bracketIdx + 1));
        if (salvaged.length > 0) {
          return { cards: salvaged } as unknown as T;
        }
      }
    }

    throw new Error('AI returned an incomplete response. Please try again.');
  }
}

export async function processSummarize(body: Record<string, unknown>): Promise<AiHandlerResult> {
  let uploadedFileName: string | undefined;
  let aiClient: GoogleGenAI | null = null;
  try {
    const { title, courseCode, contentText, fileDataUrl, fileMimeType, fileName, focusMode } = body as {
      title?: string;
      courseCode?: string;
      contentText?: string;
      fileDataUrl?: string;
      fileMimeType?: string;
      fileName?: string;
      focusMode?: string;
    };

    const ai = getGeminiClient();
    aiClient = ai;
    const prepared = await prepareMaterialInput(ai, { contentText, fileDataUrl, fileMimeType, fileName });
    uploadedFileName = prepared.uploadedFileName;

    if (prepared.unsupportedReason) {
      return { status: 400, data: { error: prepared.unsupportedReason } };
    }
    if (!prepared.textContent && !prepared.mediaPart) {
      return {
        status: 400,
        data: {
          error: 'Provide lecture notes text or attach a supported file (.pdf, .docx, .pptx, .txt, .md, or image).',
        },
      };
    }

    const modeInstruction =
      focusMode === 'exam'
        ? 'Focus on high-yield exam mastery: include explicit formulas with variable meanings, edge-case traps, likely synthesis/essay prompts with bulleted answer outlines, and distinction tables where concepts are easily confused.'
        : focusMode === 'brief'
        ? 'Keep the summary crisp and scannable as a 2-minute rapid pre-class or pre-exam revision sheet.'
        : 'Produce a comprehensive, university-honors level study guide that builds deep conceptual intuition as well as technical precision.';

    const promptText = [
      courseCode ? `Course: ${courseCode}` : '',
      title ? `Material Title: ${title}` : '',
      modeInstruction,
      'Structure your output cleanly in Markdown with these sections:',
      '## 1. Core Overview',
      '2-3 precise sentences framing the central thesis and why it matters in the course.',
      '## 2. Key Concepts & Definitions',
      'Sharp definitions, distinctions, and relationships (use Markdown tables if comparing two or more related concepts).',
      '## 3. Mechanisms, Formulas & Worked Examples',
      'Include key equations/algorithms/proof steps and at least one concrete worked example or scenario when applicable.',
      '## 4. Common Pitfalls & Exam Traps',
      '2-4 common student errors or subtle distinctions tested on exams.',
      '## 5. High-Yield Exam Takeaways',
      '3-5 actionable revision checkpoints.',
      prepared.textContent
        ? `\nStudy Material Content:\n${prepared.textContent.slice(0, 65000)}`
        : '\nSummarize the attached study document thoroughly.',
    ]
      .filter(Boolean)
      .join('\n');

    const parts: GeminiContentPart[] = [];
    if (prepared.mediaPart) parts.push(prepared.mediaPart);
    parts.push({ text: promptText });

    const response = await generateWithRetryAndFallback(ai, {
      contents: { parts },
      thinkingLevel: focusMode === 'brief' ? 'low' : 'medium',
      timeoutMs: 24_000,
      config: {
        systemInstruction:
          'You are a top-tier university lecturer and academic study strategist. Deliver accurate, rigorous, well-structured study guides grounded strictly in the provided material with zero fluff or vague platitudes. Format formulas using plain text and Unicode math symbols (×, ÷, ≤, ≥, ≈, ≠, √, ∑, ∫, →, ⇒, x², nᵢ) instead of raw LaTeX delimiters like $$...$$ or \\frac{}{}.',
      },
    });

    const summary = response.text?.trim() || '';
    if (!summary) {
      return { status: 502, data: { error: 'Empty response received from AI.' } };
    }

    return { status: 200, data: { summary } };
  } catch (error) {
    console.error('AI summarize error:', error);
    const parsed = parseApiError(error);
    return { status: parsed.status, data: { error: parsed.message } };
  } finally {
    if (uploadedFileName && aiClient) {
      await aiClient.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

interface RawQuizQuestion {
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
}

const QUIZ_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    quizTitle: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          correctIndex: { type: Type.INTEGER },
          explanation: { type: Type.STRING },
        },
        required: ['question', 'options', 'correctIndex', 'explanation'],
      },
    },
  },
  required: ['quizTitle', 'questions'],
};

function normalizeAndBalanceQuestions(
  rawList: RawQuizQuestion[],
  limit: number
): Array<{ question: string; options: string[]; correctIndex: number; explanation: string }> {
  const seen = new Set<string>();
  const normalized: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }> = [];

  for (const q of rawList) {
    if (!q || !q.question || !Array.isArray(q.options) || q.options.length < 2) continue;
    const questionText = String(q.question).trim().slice(0, 1800);
    const dedupeKey = questionText.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const opts = q.options.slice(0, 4).map((o) => String(o).trim());
    const rawIdx = Number.isFinite(q.correctIndex) ? Math.round(Number(q.correctIndex)) : 0;
    let clampedIdx = Math.max(0, Math.min(opts.length - 1, rawIdx));

    // Prevent positional-reference distortion ("Both A and B", "All of the above") before balancing
    const hasPositionalOption = opts.some((o) =>
      /\b(all of the above|none of the above|both [a-d] and [a-d]|above)\b/i.test(o)
    );
    if (!hasPositionalOption && opts.length === 4) {
      const targetIdx = normalized.length % 4;
      if (targetIdx !== clampedIdx) {
        const swapped = [...opts];
        const tmp = swapped[targetIdx];
        swapped[targetIdx] = swapped[clampedIdx];
        swapped[clampedIdx] = tmp;
        clampedIdx = targetIdx;
        opts.splice(0, 4, ...swapped);
      }
    }

    normalized.push({
      question: questionText,
      options: opts,
      correctIndex: clampedIdx,
      explanation: String(
        q.explanation || 'Review the corresponding concept and derivation in your course notes.'
      )
        .trim()
        .slice(0, 1200),
    });

    if (normalized.length >= limit) break;
  }

  return normalized;
}

export async function processQuiz(body: Record<string, unknown>): Promise<AiHandlerResult> {
  let uploadedFileName: string | undefined;
  let aiClient: GoogleGenAI | null = null;
  try {
    const { title, courseCode, contentText, fileDataUrl, fileMimeType, fileName, questionCount, difficulty } = body as {
      title?: string;
      courseCode?: string;
      contentText?: string;
      fileDataUrl?: string;
      fileMimeType?: string;
      fileName?: string;
      questionCount?: number;
      difficulty?: string;
    };

    const ai = getGeminiClient();
    aiClient = ai;
    const prepared = await prepareMaterialInput(ai, { contentText, fileDataUrl, fileMimeType, fileName });
    uploadedFileName = prepared.uploadedFileName;

    if (prepared.unsupportedReason) {
      return { status: 400, data: { error: prepared.unsupportedReason } };
    }
    if (!prepared.textContent && !prepared.mediaPart) {
      return {
        status: 400,
        data: { error: 'Provide notes, past questions, or a supported file to generate a quiz.' },
      };
    }

    const count = Math.min(50, Math.max(3, Number(questionCount) || 5));
    const level = difficulty || 'Exam Standard';

    const difficultyRubric =
      level === 'Challenging'
        ? 'Make every question genuinely demanding: require multi-step reasoning, edge-case analysis, synthesis across concepts, quantitative calculations, or subtle fault diagnosis—avoid trivial recall.'
        : level === 'Foundational'
        ? 'Test core definitions, conceptual intuition, cause-and-effect understanding, and clean introductory applications.'
        : 'Match authentic university midterm/final rigor: blend conceptual understanding (~35%), applied problem-solving/calculations (~40%), and error/edge-case diagnosis (~25%).';

    // Split larger quizzes (>16 questions) into focused concurrent sub-batches for reliability, speed, and variety
    const batchAngles = [
      'Focus on core theoretical principles, mechanisms, definitions, and conceptual misconceptions.',
      'Focus on applied scenarios, numerical/quantitative problems, comparisons, and boundary/edge cases.',
      'Focus on multi-step synthesis, experimental/code/proof diagnosis, and higher-order exam transfer questions.',
    ];

    const batchSizes: number[] = [];
    if (count <= 16) {
      batchSizes.push(count);
    } else if (count <= 32) {
      const first = Math.ceil(count / 2);
      batchSizes.push(first, count - first);
    } else {
      const b1 = Math.ceil(count / 3);
      const b2 = Math.ceil((count - b1) / 2);
      const b3 = count - b1 - b2;
      batchSizes.push(b1, b2, b3);
    }

    const thinkingPref: ThinkingPreference = 'medium';

    const runBatch = async (batchCount: number, batchIdx: number) => {
      if (batchIdx > 0) {
        await sleep(batchIdx * 220);
      }

      const angleInstruction =
        batchSizes.length > 1
          ? `Batch ${batchIdx + 1} of ${batchSizes.length}: ${batchAngles[batchIdx % batchAngles.length]} Ensure completely distinct questions from other batches.`
          : 'Cover a balanced cognitive mix of conceptual reasoning, applied problem-solving, and edge-case diagnosis.';

      const explanationGuidance =
        batchCount >= 14
          ? 'Keep explanations crisp (2 concise sentences: why the right option holds and why the main distractor fails).'
          : 'Write clear explanations (2-3 sentences: why the correct choice is right and why the most tempting distractor is wrong).';

      const promptText = [
        `Create exactly ${batchCount} distinct, non-overlapping multiple-choice university questions at "${level}" difficulty.`,
        courseCode ? `Course: ${courseCode}` : '',
        title ? `Topic/Source: ${title}` : '',
        difficultyRubric,
        angleInstruction,
        'Quality rules:',
        '- Each question must have 4 plausible, parallel options of similar specificity and length. Do NOT use "All of the above" or "None of the above".',
        '- Exactly 1 option is unambiguously correct (zero-based correctIndex 0-3). Vary correctIndex evenly across 0, 1, 2, 3.',
        `- ${explanationGuidance}`,
        '- Format any math using readable Unicode symbols (×, ÷, ≤, ≥, ≈, √, ∑, →, x², nᵢ) instead of raw LaTeX.',
        prepared.textContent
          ? `\nSource Material:\n${prepared.textContent.slice(0, 65000)}`
          : '\nGenerate questions directly from the attached document.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: GeminiContentPart[] = [];
      if (prepared.mediaPart) parts.push(prepared.mediaPart);
      parts.push({ text: promptText });

      const response = await generateWithRetryAndFallback(ai, {
        contents: { parts },
        thinkingLevel: thinkingPref,
        timeoutMs: batchCount >= 15 ? 30_000 : 24_000,
        maxTotalMs: 50_000,
        config: {
          systemInstruction:
            'You are a senior university professor writing rigorous, unambiguous exam questions. Always return valid JSON matching the schema with all requested questions and accurate correctIndex.',
          responseMimeType: 'application/json',
          responseSchema: QUIZ_SCHEMA,
        },
      });

      return parseJsonResponse<{
        quizTitle?: string;
        questions?: RawQuizQuestion[];
      }>(response.text || '{}');
    };

    const settled = await Promise.allSettled(
      batchSizes.map((size, idx) => runBatch(size, idx))
    );

    const fulfilled = settled
      .filter((r): r is PromiseFulfilledResult<{ quizTitle?: string; questions?: RawQuizQuestion[] }> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (fulfilled.length === 0) {
      const firstRejected = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      throw firstRejected?.reason || new Error('Quiz generation failed.');
    }

    const mergedRaw = fulfilled.flatMap((res) => (Array.isArray(res.questions) ? res.questions : []));
    const normalizedQuestions = normalizeAndBalanceQuestions(mergedRaw, count);

    if (normalizedQuestions.length === 0) {
      return {
        status: 502,
        data: { error: 'Could not generate structured quiz questions from this input. Try adding more detail.' },
      };
    }

    const chosenTitle =
      fulfilled.find((f) => f.quizTitle && f.quizTitle.trim())?.quizTitle?.trim() ||
      title ||
      'Practice Quiz';

    return {
      status: 200,
      data: {
        quizTitle: chosenTitle,
        questions: normalizedQuestions,
      },
    };
  } catch (error) {
    console.error('AI quiz error:', error);
    const parsed = parseApiError(error);
    return { status: parsed.status, data: { error: parsed.message } };
  } finally {
    if (uploadedFileName && aiClient) {
      await aiClient.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

export async function processFlashcards(body: Record<string, unknown>): Promise<AiHandlerResult> {
  let uploadedFileName: string | undefined;
  let aiClient: GoogleGenAI | null = null;
  try {
    const { title, courseCode, contentText, fileDataUrl, fileMimeType, fileName, cardCount } = body as {
      title?: string;
      courseCode?: string;
      contentText?: string;
      fileDataUrl?: string;
      fileMimeType?: string;
      fileName?: string;
      cardCount?: number;
    };

    const ai = getGeminiClient();
    aiClient = ai;
    const prepared = await prepareMaterialInput(ai, { contentText, fileDataUrl, fileMimeType, fileName });
    uploadedFileName = prepared.uploadedFileName;

    if (prepared.unsupportedReason) {
      return { status: 400, data: { error: prepared.unsupportedReason } };
    }
    if (!prepared.textContent && !prepared.mediaPart) {
      return { status: 400, data: { error: 'Provide notes or a supported file to generate flashcards.' } };
    }

    const count = Math.min(16, Math.max(4, Number(cardCount) || 8));

    const promptText = [
      `Generate exactly ${count} high-retention active-recall flashcards for university exam mastery.`,
      courseCode ? `Course: ${courseCode}` : '',
      title ? `Topic: ${title}` : '',
      'Prioritize mechanisms, cause-and-effect prompts, key comparisons, formulas/conditions, and common pitfalls rather than trivial one-word definitions.',
      'Each card needs a focused prompt on the front (1-2 sentences), a concise yet complete answer on the back, and an insightful memory cue/hint. Use readable Unicode math symbols instead of raw LaTeX.',
      prepared.textContent
        ? `\nSource Notes:\n${prepared.textContent.slice(0, 65000)}`
        : '\nExtract flashcards from the attached document.',
    ]
      .filter(Boolean)
      .join('\n');

    const parts: GeminiContentPart[] = [];
    if (prepared.mediaPart) parts.push(prepared.mediaPart);
    parts.push({ text: promptText });

    const response = await generateWithRetryAndFallback(ai, {
      contents: { parts },
      thinkingLevel: 'medium',
      timeoutMs: 26_000,
      config: {
        systemInstruction:
          'You create crisp, high-retention active-recall flashcards for university students. Always return valid JSON matching the schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  front: { type: Type.STRING },
                  back: { type: Type.STRING },
                  hint: { type: Type.STRING },
                },
                required: ['front', 'back', 'hint'],
              },
            },
          },
          required: ['cards'],
        },
      },
    });

    const parsed = parseJsonResponse<{
      cards?: Array<{ front?: string; back?: string; hint?: string }>;
    }>(response.text || '{}');

    const normalizedCards = (Array.isArray(parsed.cards) ? parsed.cards : [])
      .filter((c) => c && c.front && c.back)
      .map((c) => ({
        front: String(c.front).trim(),
        back: String(c.back).trim(),
        hint: String(c.hint || 'Recall the underlying principle or condition.').trim(),
      }));

    if (normalizedCards.length === 0) {
      return {
        status: 502,
        data: { error: 'Could not generate flashcards from this material. Try providing fuller notes.' },
      };
    }

    return { status: 200, data: { cards: normalizedCards } };
  } catch (error) {
    console.error('AI flashcards error:', error);
    const parsed = parseApiError(error);
    return { status: parsed.status, data: { error: parsed.message } };
  } finally {
    if (uploadedFileName && aiClient) {
      await aiClient.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

export async function processExplain(body: Record<string, unknown>): Promise<AiHandlerResult> {
  let uploadedFileName: string | undefined;
  let aiClient: GoogleGenAI | null = null;
  try {
    const { courseCode, title, questionText, fileDataUrl, fileMimeType, fileName } = body as {
      courseCode?: string;
      title?: string;
      questionText?: string;
      fileDataUrl?: string;
      fileMimeType?: string;
      fileName?: string;
    };

    const ai = getGeminiClient();
    aiClient = ai;
    const prepared = await prepareMaterialInput(ai, {
      contentText: questionText,
      fileDataUrl,
      fileMimeType,
      fileName,
    });
    uploadedFileName = prepared.uploadedFileName;

    if (prepared.unsupportedReason) {
      return { status: 400, data: { error: prepared.unsupportedReason } };
    }
    if (!prepared.textContent && !prepared.mediaPart) {
      return {
        status: 400,
        data: { error: 'Provide the past question text or attach a supported file to explain.' },
      };
    }

    const promptText = [
      courseCode ? `Course: ${courseCode}` : '',
      title ? `Past Paper: ${title}` : '',
      'Walk through this past exam question in clean Markdown using these sections:',
      '## 1. Problem Breakdown & Core Principles',
      'Identify what is being asked, given constraints/assumptions, and the governing theorem/concept.',
      '## 2. Step-by-Step Worked Solution',
      'Show every logical or mathematical step clearly with justification (handle sub-parts (a), (b), (c)... explicitly if present).',
      '## 3. Examiner Marking Rubric Points',
      'Bullet the exact method and final answer checkpoints that earn full marks.',
      '## 4. Common Mistakes & Traps to Avoid',
      'Highlight typical errors students lose marks on for this question.',
      prepared.textContent
        ? `\nQuestion Content:\n${prepared.textContent.slice(0, 65000)}`
        : '\nAnalyze the attached past exam paper thoroughly.',
    ]
      .filter(Boolean)
      .join('\n');

    const parts: GeminiContentPart[] = [];
    if (prepared.mediaPart) parts.push(prepared.mediaPart);
    parts.push({ text: promptText });

    const response = await generateWithRetryAndFallback(ai, {
      contents: { parts },
      thinkingLevel: 'medium',
      timeoutMs: 24_000,
      config: {
        systemInstruction:
          'You are an experienced university teaching fellow and exam grader walking a student through a past paper with rigorous clarity. Verify every calculation and logical transition before writing. Format math using plain readable text and Unicode symbols (×, ÷, ≤, ≥, ≈, ≠, √, ∑, ∫, →, ⇒, x², nᵢ) rather than raw LaTeX delimiters.',
      },
    });

    const explanation = (response.text || '').trim();
    if (!explanation) {
      return { status: 502, data: { error: 'Empty response received from AI.' } };
    }

    return { status: 200, data: { explanation } };
  } catch (error) {
    console.error('AI explain error:', error);
    const parsed = parseApiError(error);
    return { status: parsed.status, data: { error: parsed.message } };
  } finally {
    if (uploadedFileName && aiClient) {
      await aiClient.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

async function readJsonBody(req: NodeReqLike): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    return req.body.trim() ? (JSON.parse(req.body) as Record<string, unknown>) : {};
  }
  if (!req.on) return {};

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on!('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on!('end', () => resolve());
    req.on!('error', (err) => reject(err as unknown as Error));
  });
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

export async function handleVercelAiEndpoint(
  req: NodeReqLike,
  res: NodeResLike,
  handler: (body: Record<string, unknown>) => Promise<AiHandlerResult>
) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await handler(body);
    res.statusCode = result.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request payload.';
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
}
