import {
  handleVercelAiEndpoint,
  processQuiz,
  type NodeReqLike,
  type NodeResLike,
} from '../_aiService.js';

export default async function handler(req: NodeReqLike, res: NodeResLike) {
  await handleVercelAiEndpoint(req, res, processQuiz);
}
