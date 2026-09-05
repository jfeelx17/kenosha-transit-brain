// Server-side only. Talks to the Kenosha Transit real-time API, which is a
// GMV Syncromatics "Track" white-label site. Never import this from React
// components: it holds the upstream URL and the browser-like User-Agent.
//
// Known endpoints (all GET, JSON):
//   /Region/0/Routes            routes + their stops + colours
//   /Route/{routeId}/Vehicles   live positions, Heading, APCPercentage (load %)
//   /Stop/{stopId}/Arrivals     predictions with SecondsToArrival
//   /Resources/Traces/{file}    KML polyline of a route (best effort)

import * as mock from './mock';

export const BASE_URL = (process.env.TRANSIT_BASE_URL || 'https://www.kenoshatransit.com').replace(/\/+$/, '');
const CUSTOMER_ID = process.env.TRANSIT_CUSTOMER_ID || '';
const REGION_ID = process.env.TRANSIT_REGION_ID || '0';
const TIMEOUT_MS = Number(process.env.TRANSIT_TIMEOUT_MS) || 10000;
const ROUTES_TTL_MS = Number(process.env.TRANSIT_ROUTES_TTL_MS) || 5 * 60 * 1000;

// The upstream site rejects "bot-looking" requests; present as a normal Chrome tab.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export function isMock() {
  const v = String(process.env.KENOSHA_MOCK || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export class UpstreamError extends Error {
  constructor(message, status = 502, snippet = '') {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.snippet = snippet;
  }
}

/** HTML/text body -> short readable excerpt (tags stripped) for error messages and the debug endpoint. */
export function readableSnippet(text, max = 400) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function upstreamHeaders(raw) {
  return {
    'User-Agent': CHROME_UA,
    Accept: raw ? '*/*' : 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${BASE_URL}/`,
    'X-Requested-With': 'XMLHttpRequest',
  };
}

/**
 * Low-level GET. Resolves with status, headers and body text; only network-level
 * failures reject. Used by fetchUpstream() and by /api/debug/upstream.
 */
export async function probeUpstream(path, { raw = false, headers = {} } = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: { ...upstreamHeaders(raw), ...headers },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      url,
      finalUrl: res.url || url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get('content-type') || '',
      server: res.headers.get('server') || '',
      cfRay: res.headers.get('cf-ray') || '',
      ms: Date.now() - startedAt,
      text,
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new UpstreamError(`Kenosha Transit API timed out after ${TIMEOUT_MS} ms for ${path}`, 504);
    }
    throw new UpstreamError(`Kenosha Transit API unreachable for ${path}: ${err?.message || err}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET a path from the upstream API. Returns parsed JSON (or the raw text when
 * raw=true). Throws UpstreamError with a meaningful status and a readable
 * excerpt of whatever the site actually sent.
 */
export async function fetchUpstream(path, { raw = false } = {}) {
  const r = await probeUpstream(path, { raw });
  if (!r.ok) {
    throw new UpstreamError(
      `Kenosha Transit API answered HTTP ${r.status} for ${path}: "${readableSnippet(r.text, 160)}"`,
      r.status,
      readableSnippet(r.text)
    );
  }
  if (raw) return r.text;
  try {
    return JSON.parse(r.text);
  } catch {
    const kind = r.contentType.split(';')[0] || 'unknown content type';
    throw new UpstreamError(
      `Kenosha Transit API sent ${kind} instead of JSON for ${path} (HTTP ${r.status}): "${readableSnippet(r.text, 160)}"`,
      502,
      readableSnippet(r.text)
    );
  }
}

// ---------------------------------------------------------------------------
// Normalizers: PascalCase upstream -> small camelCase objects the UI relies on.
// Every accessor tolerates missing keys and the common spelling variants.
// ---------------------------------------------------------------------------

function pick(obj, ...keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "/Date(1700000000000-0600)/", ISO strings and epoch numbers -> ISO string. */
export function parseSyncroDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return new Date(value).toISOString();
  const m = /\/Date\((-?\d+)(?:[+-]\d{4})?\)\//.exec(String(value));
  if (m) return new Date(Number(m[1])).toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "FF0000" | "#f00" | "#ff0000" | "red" -> CSS colour; falls back when absent. */
export function normalizeColor(value, fallback = '#38bdf8') {
  if (!value || typeof value !== 'string') return fallback;
  const s = value.trim();
  if (/^#?[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(s)) return s.startsWith('#') ? s : `#${s}`;
  return s;
}

const validStop = (s) => s.id !== null && s.id !== undefined && s.lat !== null && s.lng !== null;

export function normalizeStop(s, routeId) {
  const id = pick(s, 'ID', 'Id', 'id', 'StopId', 'StopID');
  return {
    id,
    name: pick(s, 'Name', 'StopName', 'name') ?? `Stop ${id}`,
    lat: num(pick(s, 'Latitude', 'Lat', 'lat')),
    lng: num(pick(s, 'Longitude', 'Lon', 'Lng', 'lng')),
    routeId,
    order: num(pick(s, 'Order', 'Sequence')),
    isTimePoint: Boolean(pick(s, 'IsTimePoint')),
  };
}

export function normalizeRoute(r) {
  const id = pick(r, 'ID', 'Id', 'id', 'RouteId', 'RouteID');
  const stopsRaw = Array.isArray(r?.Stops) ? r.Stops : [];
  return {
    id,
    name: pick(r, 'Name', 'LongName') ?? `Route ${id}`,
    shortName: String(pick(r, 'ShortName', 'Number', 'RouteNumber') ?? id),
    color: normalizeColor(pick(r, 'Color', 'RouteColor')),
    textColor: normalizeColor(pick(r, 'TextColor'), '#ffffff'),
    isRunning: pick(r, 'IsRunning', 'IsActive') ?? true,
    traceFile: pick(r, 'RouteTraceFilename', 'TraceFile') ?? null,
    stops: stopsRaw.map((s) => normalizeStop(s, id)).filter(validStop),
  };
}

export function normalizeVehicle(v, fallbackRouteId = null) {
  const id = pick(v, 'ID', 'Id', 'id', 'VehicleId', 'VehicleID');
  return {
    id,
    name: String(pick(v, 'Name', 'VehicleName', 'BusName') ?? id),
    routeId: pick(v, 'RouteId', 'RouteID') ?? fallbackRouteId,
    lat: num(pick(v, 'Latitude', 'Lat')),
    lng: num(pick(v, 'Longitude', 'Lon', 'Lng')),
    heading: num(pick(v, 'Heading', 'Bearing')),
    speed: num(pick(v, 'Speed')),
    // Passenger load as a percentage of capacity, from the automatic passenger counter.
    apcPercentage: num(pick(v, 'APCPercentage', 'ApcPercentage', 'OccupancyPercentage', 'Occupancy')),
    onBoard: num(pick(v, 'OnBoard', 'Onboard', 'PassengerCount')),
    capacity: num(pick(v, 'Capacity', 'VehicleCapacity')),
    lastUpdated: parseSyncroDate(pick(v, 'LastUpdated', 'LastUpdate', 'Timestamp')),
    destination: pick(v, 'Destination', 'Headsign') ?? null,
    doorStatus: num(pick(v, 'DoorStatus')),
    isOnRoute: pick(v, 'IsOnRoute') ?? true,
  };
}

function normalizeArrival(a, group, stopId) {
  let seconds = num(pick(a, 'SecondsToArrival', 'SecondsUntilArrival', 'Seconds'));
  if (seconds === null) {
    const minutes = num(pick(a, 'Minutes', 'MinutesToArrival'));
    if (minutes !== null) seconds = minutes * 60;
  }
  const vehicleId = pick(a, 'VehicleID', 'VehicleId', 'BusID', 'BusId') ?? null;
  const predicted = parseSyncroDate(pick(a, 'ArriveTime', 'PredictedArrivalTime', 'EstimatedArrivalTime'));
  return {
    stopId: pick(a, 'StopId', 'StopID') ?? stopId,
    routeId: pick(a, 'RouteID', 'RouteId') ?? pick(group, 'RouteID', 'RouteId', 'ID') ?? null,
    routeName: pick(a, 'RouteName') ?? pick(group, 'RouteName', 'Name') ?? null,
    color: normalizeColor(pick(a, 'Color') ?? pick(group, 'Color'), null),
    vehicleId,
    vehicleName: pick(a, 'VehicleName', 'BusName') ?? (vehicleId !== null ? String(vehicleId) : null),
    secondsToArrival: seconds,
    minutes: seconds === null ? null : Math.max(0, Math.round(seconds / 60)),
    predictedAt: predicted ?? (seconds === null ? null : new Date(Date.now() + seconds * 1000).toISOString()),
    scheduledAt: parseSyncroDate(pick(a, 'ScheduledArrivalTime', 'ScheduledTime')),
    direction: pick(a, 'Direction', 'DirectionName') ?? null,
    destination: pick(a, 'Destination', 'Headsign') ?? null,
    isLastStop: Boolean(pick(a, 'IsLastStop')),
    deviationSeconds: num(pick(a, 'Deviation')),
  };
}

/**
 * Accepts either the grouped shape [{RouteID, Arrivals:[...]}, ...] or a flat
 * list of arrivals, and returns a flat list sorted soonest-first.
 */
export function normalizeArrivals(raw, stopId) {
  let groups = [];
  if (Array.isArray(raw)) groups = raw;
  else if (raw && Array.isArray(raw.Arrivals)) groups = [raw];
  const out = [];
  for (const g of groups) {
    if (g && Array.isArray(g.Arrivals)) {
      for (const a of g.Arrivals) out.push(normalizeArrival(a, g, stopId));
    } else if (g) {
      out.push(normalizeArrival(g, null, stopId));
    }
  }
  return out
    .filter((a) => a.secondsToArrival !== null)
    .sort((a, b) => a.secondsToArrival - b.secondsToArrival);
}

/** KML text -> array of [lng, lat] lines (one per <coordinates> block). */
export function kmlToLines(kml) {
  const lines = [];
  const re = /<coordinates>([\s\S]*?)<\/coordinates>/gi;
  let m;
  while ((m = re.exec(kml))) {
    const points = m[1]
      .trim()
      .split(/\s+/)
      .map((token) => token.split(',').map(Number))
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
      .map(([lng, lat]) => [lng, lat]);
    if (points.length > 1) lines.push(points);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Data access (mock-aware)
// ---------------------------------------------------------------------------

let routesCache = { at: 0, routes: null };

async function fetchRoutesForRegion(regionId) {
  const raw = await fetchUpstream(`/Region/${encodeURIComponent(regionId)}/Routes`);
  const list = Array.isArray(raw) ? raw : raw?.Routes || raw?.routes || [];
  return list.map(normalizeRoute).filter((r) => r.id !== undefined && r.id !== null);
}

/**
 * Routes come from /Region/{id}/Routes. Most sites use region 0, but not all,
 * so when that fails or is empty we ask /Regions which ids exist and merge
 * the routes of every region.
 */
async function fetchAllRoutes() {
  let firstError = null;
  try {
    const routes = await fetchRoutesForRegion(REGION_ID);
    if (routes.length) return routes;
  } catch (err) {
    firstError = err;
  }

  let regions = [];
  try {
    const raw = await fetchUpstream('/Regions');
    regions = (Array.isArray(raw) ? raw : raw?.Regions || [])
      .map((g) => pick(g, 'ID', 'Id', 'id', 'RegionId'))
      .filter((id) => id !== undefined && id !== null && String(id) !== String(REGION_ID));
  } catch (err) {
    throw firstError || err;
  }

  const merged = new Map();
  const results = await Promise.allSettled(regions.map((id) => fetchRoutesForRegion(id)));
  for (const r of results) {
    if (r.status === 'fulfilled') for (const route of r.value) merged.set(String(route.id), route);
  }
  if (merged.size) return [...merged.values()];
  if (firstError) throw firstError;
  throw new UpstreamError(`Kenosha Transit API listed ${regions.length} region(s) but none had routes`, 502);
}

export async function getRoutes({ force = false } = {}) {
  if (isMock()) return mock.routes().map(normalizeRoute);

  const now = Date.now();
  if (!force && routesCache.routes && now - routesCache.at < ROUTES_TTL_MS) return routesCache.routes;

  const routes = await fetchAllRoutes();

  // Some Syncromatics deployments omit Stops from the region listing. Best effort per route.
  await Promise.allSettled(
    routes
      .filter((r) => r.stops.length === 0)
      .map(async (r) => {
        const stopsRaw = await fetchUpstream(`/Route/${encodeURIComponent(r.id)}/Direction/0/Stops`);
        const arr = Array.isArray(stopsRaw) ? stopsRaw : stopsRaw?.Stops || [];
        r.stops = arr.map((s) => normalizeStop(s, r.id)).filter(validStop);
      })
  );

  routesCache = { at: now, routes };
  return routes;
}

export async function getVehicles(routeId) {
  const raw = isMock() ? mock.vehicles(routeId) : await fetchUpstream(`/Route/${encodeURIComponent(routeId)}/Vehicles`);
  const list = Array.isArray(raw) ? raw : raw?.Vehicles || [];
  return list
    .map((v) => normalizeVehicle(v, routeId))
    .filter((v) => v.id !== undefined && v.id !== null && v.lat !== null && v.lng !== null);
}

export async function getArrivals(stopId) {
  const query = CUSTOMER_ID ? `?customerId=${encodeURIComponent(CUSTOMER_ID)}` : '';
  const raw = isMock() ? mock.arrivals(stopId) : await fetchUpstream(`/Stop/${encodeURIComponent(stopId)}/Arrivals${query}`);
  return normalizeArrivals(raw, stopId);
}

/** GeoJSON Feature (MultiLineString) for a route, or null when no trace exists. */
export async function getTrace(routeId) {
  if (isMock()) return mock.trace(routeId);

  const routes = await getRoutes();
  const route = routes.find((r) => String(r.id) === String(routeId));
  if (!route?.traceFile) return null;

  const kml = await fetchUpstream(`/Resources/Traces/${encodeURIComponent(route.traceFile)}`, { raw: true });
  const coordinates = kmlToLines(kml);
  if (!coordinates.length) return null;
  return {
    type: 'Feature',
    properties: { routeId: route.id, color: route.color, name: route.name },
    geometry: { type: 'MultiLineString', coordinates },
  };
}

// ---------------------------------------------------------------------------
// API-route response helpers
// ---------------------------------------------------------------------------

export function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export function sendError(res, err, fallbackStatus = 500) {
  let status = err instanceof UpstreamError ? err.status : fallbackStatus;
  if (!(status >= 400 && status <= 599)) status = 502;
  const body = { success: false, error: err?.message || String(err), status };
  if (err?.snippet) body.snippet = err.snippet;
  sendJson(res, status, body);
}

/** Route/stop ids are short alphanumerics upstream; reject anything else early. */
export function validId(value) {
  return typeof value === 'string' && /^[\w-]{1,32}$/.test(value);
}
