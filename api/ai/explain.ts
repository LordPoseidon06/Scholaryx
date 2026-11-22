import {
  handleVercelAiEndpoint,
  processExplain,
  type NodeReqLike,
  type NodeResLike,
} from '../../server/aiService';

export default async function handler(req: NodeReqLike, res: NodeResLike) {
  await handleVercelAiEndpoint(req, res, processExplain);
}
