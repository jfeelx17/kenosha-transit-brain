import { getRoutes, isMock, sendError, sendJson } from '../../lib/transit';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);
  try {
    const routes = await getRoutes({ force: req.query.refresh === '1' });
    return sendJson(res, 200, { routes, mock: isMock(), fetchedAt: new Date().toISOString() });
  } catch (err) {
    return sendError(res, err);
  }
}
