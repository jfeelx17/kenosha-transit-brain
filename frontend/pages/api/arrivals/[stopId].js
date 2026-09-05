// Proxies GET https://www.kenoshatransit.com/Stop/{stopId}/Arrivals and
// flattens the reply into a soonest-first list with secondsToArrival.
import { getArrivals, isMock, sendError, sendJson, validId } from '../../../lib/transit';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);
  const { stopId } = req.query;
  if (!validId(stopId)) return sendError(res, new Error('Invalid stop id'), 400);
  try {
    const arrivals = await getArrivals(stopId);
    return sendJson(res, 200, { stopId, arrivals, mock: isMock(), fetchedAt: new Date().toISOString() });
  } catch (err) {
    return sendError(res, err);
  }
}
