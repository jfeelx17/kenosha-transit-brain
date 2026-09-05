// Best-effort route polyline (KML from /Resources/Traces/... converted to GeoJSON).
// 404 simply means "draw no line for this route".
import { getTrace, sendError, sendJson, validId } from '../../../lib/transit';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);
  const { routeId } = req.query;
  if (!validId(routeId)) return sendError(res, new Error('Invalid route id'), 400);
  try {
    const feature = await getTrace(routeId);
    if (!feature) return sendError(res, new Error(`No trace for route ${routeId}`), 404);
    return sendJson(res, 200, { routeId, feature });
  } catch (err) {
    return sendError(res, err);
  }
}
