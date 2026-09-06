// Proxies GET https://www.kenoshatransit.com/Route/{routeId}/Vehicles
// (same-origin for the browser, so no CORS; identifies itself as KenoshaLoop upstream).
import { getVehicles, isMock, sendError, sendJson, validId } from '../../../lib/transit';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);
  const { routeId } = req.query;
  if (!validId(routeId)) return sendError(res, new Error('Invalid route id'), 400);
  try {
    const vehicles = await getVehicles(routeId);
    return sendJson(res, 200, { routeId, vehicles, mock: isMock(), fetchedAt: new Date().toISOString() });
  } catch (err) {
    return sendError(res, err);
  }
}
