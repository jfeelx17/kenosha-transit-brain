// GET /api/stops/nearby?lat=42.58&lon=-87.82&distance=1500&limit=8
// Nearest stops to a point (metres), via kenoshatransit.com's stops/search.
import { getNearbyStops, isMock, sendError, sendJson } from '../../../lib/transit';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon ?? req.query.lng);
  const distance = Math.min(10000, Math.max(100, Number(req.query.distance) || 1500));
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 8));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return sendError(res, new Error('lat and lon are required'), 400);
  }
  try {
    const stops = await getNearbyStops({ lat, lon, distance, limit });
    return sendJson(res, 200, { lat, lon, distance, stops, mock: isMock(), fetchedAt: new Date().toISOString() });
  } catch (err) {
    return sendError(res, err);
  }
}
