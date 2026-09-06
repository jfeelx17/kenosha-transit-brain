// GET /api/routes -> every route with its stops, plus the service alerts in force right now.
//
// Both come out of the same server-rendered page, cached together for 5 minutes, so asking for
// alerts here costs no extra upstream request.
import { getAlerts, getRoutes, isMock, sendError, sendJson } from '../../lib/transit';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);
  const force = req.query.refresh === '1';
  try {
    const routes = await getRoutes({ force });
    // getAlerts never throws; a missing notice must not take the map down.
    const alerts = await getAlerts({ force });
    return sendJson(res, 200, { routes, alerts, mock: isMock(), fetchedAt: new Date().toISOString() });
  } catch (err) {
    return sendError(res, err);
  }
}
