import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

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

function parseDataUrlPart(fileDataUrl?: string, fallbackMime?: string) {
  if (!fileDataUrl || typeof fileDataUrl !== 'string') return null;
  const match = fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1] || fallbackMime || 'application/octet-stream';
  const data = match[2];
  const supported =
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType.startsWith('text/');
  if (!supported) return null;
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Summarize study notes / slides / uploaded PDF or image
  app.post('/api/ai/summarize', async (req, res) => {
    try {
      const { title, courseCode, contentText, fileDataUrl, fileMimeType, focusMode } = req.body as {
        title?: string;
        courseCode?: string;
        contentText?: string;
        fileDataUrl?: string;
        fileMimeType?: string;
        focusMode?: string;
      };

      const inlinePart = parseDataUrlPart(fileDataUrl, fileMimeType);
      const trimmedText = (contentText || '').trim();

      if (!trimmedText && !inlinePart) {
        return res.status(400).json({ error: 'Provide lecture notes text or attach a supported PDF/image file to summarize.' });
      }

      const ai = getGeminiClient();
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
        trimmedText ? `\nStudy Material Content:\n${trimmedText.slice(0, 45000)}` : '\nSummarize the attached study document.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (inlinePart) parts.push(inlinePart);
      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
          systemInstruction:
            'You are an academic study assistant for university students. Write accurate, structured, crystal-clear study summaries with zero filler or fluff.',
        },
      });

      const summary = response.text?.trim() || '';
      if (!summary) {
        return res.status(502).json({ error: 'Empty response received from Gemini.' });
      }

      res.json({ summary });
    } catch (error) {
      console.error('AI summarize error:', error);
      const message = error instanceof Error ? error.message : 'Failed to summarize study material.';
      res.status(500).json({ error: message });
    }
  });

  // Generate interactive retention quiz JSON
  app.post('/api/ai/quiz', async (req, res) => {
    try {
      const { title, courseCode, contentText, fileDataUrl, fileMimeType, questionCount, difficulty } = req.body as {
        title?: string;
        courseCode?: string;
        contentText?: string;
        fileDataUrl?: string;
        fileMimeType?: string;
        questionCount?: number;
        difficulty?: string;
      };

      const inlinePart = parseDataUrlPart(fileDataUrl, fileMimeType);
      const trimmedText = (contentText || '').trim();

      if (!trimmedText && !inlinePart) {
        return res.status(400).json({ error: 'Provide notes, past questions, or a supported file to generate a quiz.' });
      }

      const count = Math.min(12, Math.max(3, Number(questionCount) || 5));
      const level = difficulty || 'Exam Standard';

      const ai = getGeminiClient();
      const promptText = [
        `Create exactly ${count} multiple-choice university study questions at "${level}" difficulty.`,
        courseCode ? `Course: ${courseCode}` : '',
        title ? `Topic/Source: ${title}` : '',
        'Each question must have 4 plausible options, 1 unambiguously correct answer (zero-based index 0-3), and a concise explanation referencing why the answer is right.',
        trimmedText ? `\nSource Material:\n${trimmedText.slice(0, 45000)}` : '\nGenerate questions directly from the attached document.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (inlinePart) parts.push(inlinePart);
      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
          systemInstruction:
            'You are a university professor crafting rigorous active-recall practice questions. Always return valid JSON matching the schema.',
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

      const raw = (response.text || '{}').trim();
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (error) {
      console.error('AI quiz error:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate quiz.';
      res.status(500).json({ error: message });
    }
  });

  // Generate active-recall flashcards JSON
  app.post('/api/ai/flashcards', async (req, res) => {
    try {
      const { title, courseCode, contentText, fileDataUrl, fileMimeType, cardCount } = req.body as {
        title?: string;
        courseCode?: string;
        contentText?: string;
        fileDataUrl?: string;
        fileMimeType?: string;
        cardCount?: number;
      };

      const inlinePart = parseDataUrlPart(fileDataUrl, fileMimeType);
      const trimmedText = (contentText || '').trim();

      if (!trimmedText && !inlinePart) {
        return res.status(400).json({ error: 'Provide notes or a supported file to generate flashcards.' });
      }

      const count = Math.min(16, Math.max(4, Number(cardCount) || 8));
      const ai = getGeminiClient();

      const promptText = [
        `Generate ${count} active-recall flashcards for university exam retention.`,
        courseCode ? `Course: ${courseCode}` : '',
        title ? `Topic: ${title}` : '',
        'Each flashcard needs a crisp question/prompt on the front, a precise answer on the back, and a short memory hint.',
        trimmedText ? `\nSource Notes:\n${trimmedText.slice(0, 45000)}` : '\nExtract flashcards from the attached document.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (inlinePart) parts.push(inlinePart);
      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
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

      const parsed = JSON.parse((response.text || '{}').trim());
      res.json(parsed);
    } catch (error) {
      console.error('AI flashcards error:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate flashcards.';
      res.status(500).json({ error: message });
    }
  });

  // Explain a past exam question step-by-step
  app.post('/api/ai/explain', async (req, res) => {
    try {
      const { courseCode, title, questionText, fileDataUrl, fileMimeType } = req.body as {
        courseCode?: string;
        title?: string;
        questionText?: string;
        fileDataUrl?: string;
        fileMimeType?: string;
      };

      const inlinePart = parseDataUrlPart(fileDataUrl, fileMimeType);
      const trimmedText = (questionText || '').trim();

      if (!trimmedText && !inlinePart) {
        return res.status(400).json({ error: 'Provide the past question text or attach a file to explain.' });
      }

      const ai = getGeminiClient();
      const promptText = [
        courseCode ? `Course: ${courseCode}` : '',
        title ? `Past Paper: ${title}` : '',
        'Provide a step-by-step worked solution guide, key marking rubric points, and common mistakes to avoid for this past exam question.',
        trimmedText ? `\nQuestion Content:\n${trimmedText.slice(0, 45000)}` : '\nAnalyze the attached past exam paper.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (inlinePart) parts.push(inlinePart);
      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
          systemInstruction:
            'You are a university teaching fellow walking a student through a past exam paper with rigorous clarity.',
        },
      });

      res.json({ explanation: (response.text || '').trim() });
    } catch (error) {
      console.error('AI explain error:', error);
      const message = error instanceof Error ? error.message : 'Failed to explain question.';
      res.status(500).json({ error: message });
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
