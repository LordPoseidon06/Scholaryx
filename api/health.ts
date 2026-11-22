import { getConfiguredApiKey, type NodeReqLike, type NodeResLike } from './_aiService.js';

export default function handler(_req: NodeReqLike, res: NodeResLike) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      ok: true,
      hasGeminiKey: Boolean(getConfiguredApiKey()),
    })
  );
}
