import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const INLINE_BINARY_CHAR_LIMIT = 16_000_000; // ~12 MB binary -> use Gemini Files API above this

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
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

function parseApiError(error: unknown): { status: number; message: string; retryable: boolean } {
  const fallback = {
    status: 500,
    message: 'AI request failed. Please try again.',
    retryable: false,
  };

  if (!error) return fallback;

  let rawMessage = error instanceof Error ? error.message : String(error);
  let status = typeof (error as { status?: number })?.status === 'number'
    ? (error as { status: number }).status
    : 500;

  // Unwrap nested JSON error strings thrown by the Google GenAI SDK
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
  const retryable =
    status === 503 ||
    status === 429 ||
    status === 502 ||
    status === 504 ||
    lower.includes('high demand') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('temporarily');

  if (status === 503 || lower.includes('high demand') || lower.includes('unavailable')) {
    return {
      status: 503,
      message: 'The AI study engine is temporarily busy. Please try again in a few seconds.',
      retryable: true,
    };
  }

  if (status === 429 || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      status: 429,
      message: 'Too many AI requests right now. Wait a few seconds and try again.',
      retryable: true,
    };
  }

  if (status === 401 || status === 403 || lower.includes('api key') || lower.includes('permission')) {
    return {
      status: 403,
      message: 'Gemini API key is missing or unauthorized. Check Settings -> Secrets.',
      retryable: false,
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: rawMessage || fallback.message,
    retryable,
  };
}

type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { fileUri: string; mimeType: string } };

async function generateWithRetryAndFallback(
  ai: GoogleGenAI,
  request: {
    contents: { parts: GeminiContentPart[] };
    config?: Record<string, unknown>;
  }
) {
  const attempts: Array<{ model: string; useLowThinking: boolean; delayMs: number }> = [
    { model: PRIMARY_MODEL, useLowThinking: true, delayMs: 0 },
    { model: PRIMARY_MODEL, useLowThinking: true, delayMs: 650 },
    { model: FALLBACK_MODEL, useLowThinking: false, delayMs: 850 },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }
    try {
      const config = { ...(request.config || {}) };
      if (attempt.useLowThinking) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      } else {
        delete config.thinkingConfig;
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
            unsupportedReason: 'This .pptx deck appears to contain only images or empty slides. Export as PDF for AI analysis.',
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
            unsupportedReason: 'Legacy binary .doc/.ppt files cannot be parsed directly. Save as .docx, .pptx, or .pdf, or paste the text.',
          };
        }
      } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        extractedFromFile = Buffer.from(data, 'base64').toString('utf-8').trim();
      } else if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
        if (data.length > INLINE_BINARY_CHAR_LIMIT) {
          // Upload large files (up to 100 MB) via Gemini Files API
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

function parseJsonResponse<T>(rawText: string): T {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return JSON.parse(cleaned) as T;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '150mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Summarize study notes / slides / uploaded PDF, DOCX, PPTX, or image
  app.post('/api/ai/summarize', async (req, res) => {
    let uploadedFileName: string | undefined;
    let aiClient: GoogleGenAI | null = null;
    try {
      const { title, courseCode, contentText, fileDataUrl, fileMimeType, fileName, focusMode } = req.body as {
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
        return res.status(400).json({ error: prepared.unsupportedReason });
      }
      if (!prepared.textContent && !prepared.mediaPart) {
        return res.status(400).json({
          error: 'Provide lecture notes text or attach a supported file (.pdf, .docx, .pptx, .txt, .md, or image).',
        });
      }

      const modeInstruction =
        focusMode === 'exam'
          ? 'Emphasize high-yield exam concepts, formulas, common traps, and likely essay or problem-solving prompts.'
          : focusMode === 'brief'
          ? 'Keep the summary concise and scannable as a quick 2-minute revision sheet.'
          : 'Provide a clear, thorough academic study guide suitable for university revision.';

      const promptText = [
        courseCode ? `Course: ${courseCode}` : '',
        title ? `Material Title: ${title}` : '',
        modeInstruction,
        'Structure your output clearly in clean Markdown with these sections:',
        '1. Core Overview (2-3 sentences)',
        '2. Key Concepts & Definitions (bulleted)',
        '3. Mechanisms, Proofs, or Formulas (if applicable)',
        '4. High-Yield Exam Takeaways (3-5 actionable bullets)',
        prepared.textContent
          ? `\nStudy Material Content:\n${prepared.textContent.slice(0, 60000)}`
          : '\nSummarize the attached study document.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: GeminiContentPart[] = [];
      if (prepared.mediaPart) parts.push(prepared.mediaPart);
      parts.push({ text: promptText });

      const response = await generateWithRetryAndFallback(ai, {
        contents: { parts },
        config: {
          systemInstruction:
            'You are an academic study assistant for university students. Write accurate, structured, crystal-clear study summaries with zero filler or fluff. Format equations using plain text and Unicode math symbols (×, ÷, ≤, ≥, ≈, √, ∑, x², nᵢ) instead of raw LaTeX delimiters like $$...$$ or \\frac{}{}.',
        },
      });

      const summary = response.text?.trim() || '';
      if (!summary) {
        return res.status(502).json({ error: 'Empty response received from AI.' });
      }

      res.json({ summary });
    } catch (error) {
      console.error('AI summarize error:', error);
      const parsed = parseApiError(error);
      res.status(parsed.status).json({ error: parsed.message });
    } finally {
      if (uploadedFileName && aiClient) {
        await aiClient.files.delete({ name: uploadedFileName }).catch(() => {});
      }
    }
  });

  // Generate interactive retention quiz JSON (up to 50 questions)
  app.post('/api/ai/quiz', async (req, res) => {
    let uploadedFileName: string | undefined;
    let aiClient: GoogleGenAI | null = null;
    try {
      const { title, courseCode, contentText, fileDataUrl, fileMimeType, fileName, questionCount, difficulty } = req.body as {
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
        return res.status(400).json({ error: prepared.unsupportedReason });
      }
      if (!prepared.textContent && !prepared.mediaPart) {
        return res.status(400).json({
          error: 'Provide notes, past questions, or a supported file to generate a quiz.',
        });
      }

      const count = Math.min(50, Math.max(3, Number(questionCount) || 5));
      const level = difficulty || 'Exam Standard';
      const concisenessNote =
        count >= 25
          ? 'Keep each question clear and each explanation concise (1-2 crisp sentences) so all questions fit completely.'
          : 'Include a clear explanation referencing why the correct answer is right.';

      const promptText = [
        `Create exactly ${count} distinct, non-overlapping multiple-choice university study questions at "${level}" difficulty.`,
        courseCode ? `Course: ${courseCode}` : '',
        title ? `Topic/Source: ${title}` : '',
        `Each question must have 4 plausible options and 1 unambiguously correct answer (zero-based index 0-3). ${concisenessNote} Write any formulas using readable Unicode characters rather than raw LaTeX.`,
        prepared.textContent
          ? `\nSource Material:\n${prepared.textContent.slice(0, 60000)}`
          : '\nGenerate questions directly from the attached document.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: GeminiContentPart[] = [];
      if (prepared.mediaPart) parts.push(prepared.mediaPart);
      parts.push({ text: promptText });

      const response = await generateWithRetryAndFallback(ai, {
        contents: { parts },
        config: {
          systemInstruction:
            'You are a university professor crafting rigorous active-recall practice questions. Always return valid JSON matching the schema with all requested questions.',
          responseMimeType: 'application/json',
          responseSchema: {
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
          },
        },
      });

      const parsed = parseJsonResponse<{
        quizTitle?: string;
        questions?: Array<{
          question?: string;
          options?: string[];
          correctIndex?: number;
          explanation?: string;
        }>;
      }>(response.text || '{}');

      const normalizedQuestions = (Array.isArray(parsed.questions) ? parsed.questions : [])
        .slice(0, 50)
        .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
        .map((q) => {
          const opts = (q.options || []).slice(0, 4).map((o) => String(o));
          const rawIdx = Number.isFinite(q.correctIndex) ? Number(q.correctIndex) : 0;
          const clampedIdx = Math.max(0, Math.min(opts.length - 1, rawIdx));
          return {
            question: String(q.question).slice(0, 1800),
            options: opts,
            correctIndex: clampedIdx,
            explanation: String(q.explanation || 'Review the corresponding section in your course notes.').slice(0, 1200),
          };
        });

      if (normalizedQuestions.length === 0) {
        return res.status(502).json({
          error: 'Could not generate structured quiz questions from this input. Try adding more detail.',
        });
      }

      res.json({
        quizTitle: parsed.quizTitle || title || 'Practice Quiz',
        questions: normalizedQuestions,
      });
    } catch (error) {
      console.error('AI quiz error:', error);
      const parsed = parseApiError(error);
      res.status(parsed.status).json({ error: parsed.message });
    } finally {
      if (uploadedFileName && aiClient) {
        await aiClient.files.delete({ name: uploadedFileName }).catch(() => {});
      }
    }
  });

  // Generate active-recall flashcards JSON
  app.post('/api/ai/flashcards', async (req, res) => {
    let uploadedFileName: string | undefined;
    let aiClient: GoogleGenAI | null = null;
    try {
      const { title, courseCode, contentText, fileDataUrl, fileMimeType, fileName, cardCount } = req.body as {
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
        return res.status(400).json({ error: prepared.unsupportedReason });
      }
      if (!prepared.textContent && !prepared.mediaPart) {
        return res.status(400).json({ error: 'Provide notes or a supported file to generate flashcards.' });
      }

      const count = Math.min(16, Math.max(4, Number(cardCount) || 8));

      const promptText = [
        `Generate exactly ${count} active-recall flashcards for university exam retention.`,
        courseCode ? `Course: ${courseCode}` : '',
        title ? `Topic: ${title}` : '',
        'Each flashcard needs a crisp question/prompt on the front, a precise answer on the back, and a short memory hint. Use readable plain text and Unicode math symbols rather than raw LaTeX.',
        prepared.textContent
          ? `\nSource Notes:\n${prepared.textContent.slice(0, 60000)}`
          : '\nExtract flashcards from the attached document.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: GeminiContentPart[] = [];
      if (prepared.mediaPart) parts.push(prepared.mediaPart);
      parts.push({ text: promptText });

      const response = await generateWithRetryAndFallback(ai, {
        contents: { parts },
        config: {
          systemInstruction:
            'You create concise, high-retention active-recall flashcards for university students. Always return valid JSON matching the schema.',
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
          front: String(c.front),
          back: String(c.back),
          hint: String(c.hint || 'Think about the core definition.'),
        }));

      if (normalizedCards.length === 0) {
        return res.status(502).json({
          error: 'Could not generate flashcards from this material. Try providing fuller notes.',
        });
      }

      res.json({ cards: normalizedCards });
    } catch (error) {
      console.error('AI flashcards error:', error);
      const parsed = parseApiError(error);
      res.status(parsed.status).json({ error: parsed.message });
    } finally {
      if (uploadedFileName && aiClient) {
        await aiClient.files.delete({ name: uploadedFileName }).catch(() => {});
      }
    }
  });

  // Explain a past exam question step-by-step
  app.post('/api/ai/explain', async (req, res) => {
    let uploadedFileName: string | undefined;
    let aiClient: GoogleGenAI | null = null;
    try {
      const { courseCode, title, questionText, fileDataUrl, fileMimeType, fileName } = req.body as {
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
        return res.status(400).json({ error: prepared.unsupportedReason });
      }
      if (!prepared.textContent && !prepared.mediaPart) {
        return res.status(400).json({ error: 'Provide the past question text or attach a supported file to explain.' });
      }

      const promptText = [
        courseCode ? `Course: ${courseCode}` : '',
        title ? `Past Paper: ${title}` : '',
        'Provide a step-by-step worked solution guide, key marking rubric points, and common mistakes to avoid for this past exam question.',
        prepared.textContent
          ? `\nQuestion Content:\n${prepared.textContent.slice(0, 60000)}`
          : '\nAnalyze the attached past exam paper.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: GeminiContentPart[] = [];
      if (prepared.mediaPart) parts.push(prepared.mediaPart);
      parts.push({ text: promptText });

      const response = await generateWithRetryAndFallback(ai, {
        contents: { parts },
        config: {
          systemInstruction:
            'You are a university teaching fellow walking a student through a past exam paper with rigorous clarity. Format math using plain readable text and Unicode symbols (×, ÷, ≤, ≥, ≈, √, ∑, x²) rather than raw LaTeX delimiters.',
        },
      });

      const explanation = (response.text || '').trim();
      if (!explanation) {
        return res.status(502).json({ error: 'Empty response received from AI.' });
      }

      res.json({ explanation });
    } catch (error) {
      console.error('AI explain error:', error);
      const parsed = parseApiError(error);
      res.status(parsed.status).json({ error: parsed.message });
    } finally {
      if (uploadedFileName && aiClient) {
        await aiClient.files.delete({ name: uploadedFileName }).catch(() => {});
      }
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Scholaryx server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
