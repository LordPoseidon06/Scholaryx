import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  processExplain,
  processFlashcards,
  processQuiz,
  processSummarize,
} from './api/_aiService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '150mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/ai/summarize', async (req, res) => {
    const result = await processSummarize(req.body || {});
    res.status(result.status).json(result.data);
  });

  app.post('/api/ai/quiz', async (req, res) => {
    const result = await processQuiz(req.body || {});
    res.status(result.status).json(result.data);
  });

  app.post('/api/ai/flashcards', async (req, res) => {
    const result = await processFlashcards(req.body || {});
    res.status(result.status).json(result.data);
  });

  app.post('/api/ai/explain', async (req, res) => {
    const result = await processExplain(req.body || {});
    res.status(result.status).json(result.data);
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
