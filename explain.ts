import {
  handleVercelAiEndpoint,
  processExplain,
  type NodeReqLike,
  type NodeResLike,
} from '../_aiService.js';

export default async function handler(req: NodeReqLike, res: NodeResLike) {
  await handleVercelAiEndpoint(req, res, processExplain);
}
