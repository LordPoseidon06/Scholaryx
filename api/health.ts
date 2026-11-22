import type { NodeReqLike, NodeResLike } from '../server/aiService';

export default function handler(_req: NodeReqLike, res: NodeResLike) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      ok: true,
      hasGeminiKey: Boolean(
        process.env.GEMINI_API_KEY?.trim() &&
          process.env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY'
      ),
    })
  );
}
