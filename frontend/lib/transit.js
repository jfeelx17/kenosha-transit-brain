// Server-side only. Talks to the Kenosha Transit real-time data behind
// kenoshatransit.com. Never import this from React components.
//
// The site (a GMV Syncromatics "portal" front-end) gets its data through a
// same-origin proxy that adds the vendor API key on the server:
//
//   GET https://www.kenoshatransit.com/api/rtpi?path=<portal path>
//
// Portal paths seen in the site's own code:
//   routes/{routeId}/vehicles            live positions + passenger load
//   routes/{routeId}/stops               stops served by a route
//   routes/{routeId}/patterns            patterns with an encoded polyline shape
//   routes/{routeId}/patterns/{p}/stops  ordered stops of a pattern
//   stops/{stopId}/arrivals[?routeId=]   predictions with secondsToArrival
//   stops/search?lat=&lon=&distance=     nearby stops
//
// The route list itself is server-rendered into the page's React Router
// hydration data, so we read it from the HTML shell (no key needed).
//
// Older Syncromatics "Track" sites use /Region/0/Routes, /Route/{id}/Vehicles
// and /Stop/{id}/Arrivals; those remain as a fallback (TRANSIT_API_STYLE=track).

import * as mock from './mock';

export const BASE_URL = (process.env.TRANSIT_BASE_URL || 'https://www.kenoshatransit.com').replace(/\/+$/, '');
const CUSTOMER_ID = process.env.TRANSIT_CUSTOMER_ID || '';
const REGION_ID = process.env.TRANSIT_REGION_ID || '0';
const API_STYLE = (process.env.TRANSIT_API_STYLE || 'auto').toLowerCase(); // auto | portal | track
const RTPI_PATH = process.env.TRANSIT_RTPI_PATH || '/api/rtpi';
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

/** Build the same-origin proxy URL the site's own front-end uses. */
export function rtpiPath(portalPath) {
  const clean = String(portalPath).replace(/^\/+/, '');
  return `${RTPI_PATH}?path=${encodeURIComponent(clean)}`;
}

/** GET a portal path through kenoshatransit.com's /api/rtpi proxy. */
export async function fetchPortal(portalPath) {
  return fetchUpstream(rtpiPath(portalPath));
}

/** Portal responses are either a bare array or { data: [...] }. */
export function unwrapList(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.results)) return value.results;
  return [];
}

/**
 * Decode React Router's turbo-stream hydration payload (the JSON array passed
 * to streamController.enqueue). Objects are {"_<keyIndex>": valueIndex},
 * arrays are index lists, negative numbers are sentinels (-5 = null).
 */
export function decodeTurboStream(arr) {
  const SENTINEL = { '-1': undefined, '-2': NaN, '-3': -Infinity, '-4': -0, '-5': null, '-6': Infinity, '-7': undefined };
  const cache = new Map();
  const hydrate = (i) => {
    if (typeof i !== 'number') return i;
    if (i < 0) return SENTINEL[String(i)];
    if (cache.has(i)) return cache.get(i);
    const v = arr[i];
    if (Array.isArray(v)) {
      const out = [];
      cache.set(i, out);
      for (const x of v) out.push(hydrate(x));
      return out;
    }
    if (v && typeof v === 'object') {
      const out = {};
      cache.set(i, out);
      for (const [k, val] of Object.entries(v)) {
        const key = k.startsWith('_') ? arr[Number(k.slice(1))] : k;
        out[typeof key === 'string' ? key : k] = hydrate(val);
      }
      return out;
    }
    return v;
  };
  return hydrate(0);
}

/** Pull the hydration payload(s) out of the HTML shell and decode them. */
export function hydrationFromHtml(html) {
  const re = /streamController\.enqueue\((".*?")\);?/gs;
  const decoded = [];
  let m;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(JSON.parse(m[1]));
      decoded.push(Array.isArray(parsed) ? decodeTurboStream(parsed) : parsed);
    } catch {
      // ignore chunks we cannot parse
    }
  }
  return decoded;
}

/** Route list embedded in the page: loaderData["routes/transit"].services[].routes[]. */
export function routesFromHydration(html) {
  const out = [];
  for (const chunk of hydrationFromHtml(html)) {
    const loader = chunk?.loaderData || {};
    for (const value of Object.values(loader)) {
      const services = value?.services;
      if (!Array.isArray(services)) continue;
      for (const service of services) for (const r of service?.routes || []) out.push(r);
    }
  }
  return out;
}

/** Google encoded polyline -> [[lng, lat], ...]. Tries precision 5, then 6. */
export function decodePolyline(str, precision = 5) {
  const factor = 10 ** precision;
  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < str.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < str.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lng / factor, lat / factor]);
  }
  const sane = coords.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90);
  if (!sane && precision === 5) return decodePolyline(str, 6);
  return sane ? coords : [];
}

/** Anything shape-like (encoded polyline, [[lat,lon]], [{lat,lon}], GeoJSON) -> [[lng,lat], ...] lines. */
export function shapeToLines(shape) {
  if (!shape) return [];
  if (typeof shape === 'string') {
    const line = decodePolyline(shape);
    return line.length > 1 ? [line] : [];
  }
  if (Array.isArray(shape)) {
    if (shape.length && Array.isArray(shape[0]) && typeof shape[0][0] === 'number') {
      // [[lat, lon], ...] (most vendors) or [[lng, lat], ...]
      const latFirst = shape.every(([a, b]) => Math.abs(a) <= 90 && Math.abs(b) <= 180 && Math.abs(b) > Math.abs(a));
      const line = shape.map(([a, b]) => (latFirst ? [b, a] : [a, b]));
      return line.length > 1 ? [line] : [];
    }
    if (shape.length && typeof shape[0] === 'object') {
      const line = shape
        .map((p) => [num(pick(p, 'lon', 'lng', 'longitude', 'Longitude')), num(pick(p, 'lat', 'latitude', 'Latitude'))])
        .filter(([x, y]) => x !== null && y !== null);
      return line.length > 1 ? [line] : [];
    }
    return [];
  }
  if (typeof shape === 'object') {
    if (shape.type === 'LineString') return [shape.coordinates];
    if (shape.type === 'MultiLineString') return shape.coordinates;
    if (shape.type === 'Feature') return shapeToLines(shape.geometry);
    if (shape.type === 'FeatureCollection') return shape.features.flatMap((f) => shapeToLines(f.geometry));
    if (shape.geometry) return shapeToLines(shape.geometry);
    if (shape.shape || shape.encodedShape || shape.polyline || shape.points) {
      return shapeToLines(shape.shape || shape.encodedShape || shape.polyline || shape.points);
    }
  }
  return [];
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

export function normalizeStop(raw, routeId) {
  const s = raw && raw.stop && typeof raw.stop === 'object' ? { ...raw.stop, sequence: raw.sequence ?? raw.stop.sequence } : raw;
  const id = pick(s, 'ID', 'Id', 'id', 'StopId', 'StopID', 'stopId');
  return {
    id,
    name: pick(s, 'Name', 'StopName', 'name') ?? `Stop ${id}`,
    lat: num(pick(s, 'Latitude', 'Lat', 'lat', 'latitude')),
    lng: num(pick(s, 'Longitude', 'Lon', 'Lng', 'lng', 'lon', 'longitude')),
    routeId,
    order: num(pick(s, 'Order', 'Sequence', 'sequence', 'stopSequence')),
    code: pick(s, 'stopCode', 'StopCode', 'rtpiNumber', 'RtpiNumber', 'Code') ?? null,
    isTimePoint: Boolean(pick(s, 'IsTimePoint', 'isTimePoint')),
  };
}

/** "Mahone School Tripper" -> "MST"; short names stay as they are. */
export function shortLabelFor(shortName) {
  const s = String(shortName ?? '').trim();
  if (s.length <= 5) return s;
  const initials = s
    .split(/[\s/-]+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .map((w) => w[0].toUpperCase())
    .join('');
  return initials.slice(0, 4) || s.slice(0, 4);
}

export function normalizeRoute(r) {
  const id = pick(r, 'ID', 'Id', 'id', 'RouteId', 'RouteID');
  const stopsRaw = Array.isArray(r?.Stops) ? r.Stops : [];
  const name = pick(r, 'Name', 'LongName', 'name', 'longName') ?? `Route ${id}`;
  const shortName = String(pick(r, 'ShortName', 'Number', 'RouteNumber', 'shortName') ?? id);
  return {
    id,
    name,
    shortName,
    shortLabel: shortLabelFor(shortName),
    // School trippers only run on school days; hidden by default so they do not bury the network.
    isSchool: /school|tripper/i.test(`${name} ${shortName}`),
    color: normalizeColor(pick(r, 'Color', 'RouteColor', 'color')),
    textColor: normalizeColor(pick(r, 'TextColor', 'textColor'), '#ffffff'),
    description: pick(r, 'description', 'Description') ?? null,
    routeType: pick(r, 'routeType', 'RouteType') ?? null,
    displayOrder: num(pick(r, 'displayOrder', 'Order', 'order')),
    isRunning: pick(r, 'IsRunning', 'IsActive', 'isRunning', 'isActive') ?? true,
    traceFile: pick(r, 'RouteTraceFilename', 'TraceFile') ?? null,
    stops: stopsRaw.map((s) => normalizeStop(s, id)).filter(validStop),
  };
}

const OCCUPANCY_WORDS = {
  EMPTY: 5,
  MANY_SEATS_AVAILABLE: 25,
  FEW_SEATS_AVAILABLE: 55,
  STANDING_ROOM_ONLY: 80,
  CRUSHED_STANDING_ROOM_ONLY: 95,
  FULL: 100,
  NOT_ACCEPTING_PASSENGERS: 100,
  LOW: 20,
  MEDIUM: 55,
  HIGH: 85,
};

/** Passenger load as 0-100 from a number, a "45%" string, or a GTFS-style occupancy word. */
function loadPercent(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? (value <= 1 && value > 0 ? Math.round(value * 100) : value) : null;
  const str = String(value).trim();
  const n = Number(str.replace('%', ''));
  if (Number.isFinite(n) && str !== '') return n;
  const word = str.toUpperCase().replace(/[\s-]+/g, '_');
  return OCCUPANCY_WORDS[word] ?? null;
}

export function normalizeVehicle(v, fallbackRouteId = null) {
  const id = pick(v, 'ID', 'Id', 'id', 'VehicleId', 'VehicleID', 'vehicleId');
  const onBoard = num(pick(v, 'OnBoard', 'Onboard', 'PassengerCount', 'passengerCount', 'passengers', 'onBoard'));
  const capacity = num(pick(v, 'Capacity', 'VehicleCapacity', 'capacity', 'maxCapacity', 'seatedCapacity'));
  let apc = loadPercent(
    pick(
      v,
      'APCPercentage',
      'ApcPercentage',
      'apcPercentage',
      'OccupancyPercentage',
      'occupancyPercentage',
      'passengerLoadPercentage',
      'passengerLoadPercent',
      'loadPercentage',
      'loadPercent',
      'percentFull',
      'passengerLoad',
      'occupancy',
      'occupancyStatus',
      'load'
    )
  );
  if (apc === null && onBoard !== null && capacity) apc = Math.round((onBoard / capacity) * 100);
  return {
    id,
    name: String(pick(v, 'Name', 'VehicleName', 'BusName', 'name', 'label', 'vehicleName', 'fleetNumber') ?? id),
    routeId: pick(v, 'RouteId', 'RouteID', 'routeId') ?? v?.route?.id ?? fallbackRouteId,
    lat: num(pick(v, 'Latitude', 'Lat', 'lat', 'latitude')),
    lng: num(pick(v, 'Longitude', 'Lon', 'Lng', 'lng', 'lon', 'longitude')),
    heading: num(
      pick(v, 'Heading', 'Bearing', 'heading', 'bearing', 'course', 'courseOverGround', 'headingDegrees', 'bearingDegrees', 'orientation', 'rotation', 'angle', 'compass', 'direction')
    ),
    speed: num(pick(v, 'Speed', 'speed')),
    // Passenger load as a percentage of capacity (automatic passenger counter).
    apcPercentage: apc,
    onBoard,
    capacity,
    lastUpdated: parseSyncroDate(pick(v, 'LastUpdated', 'LastUpdate', 'Timestamp', 'lastUpdated', 'lastUpdate', 'timestamp', 'updatedAt', 'time')),
    destination: pick(v, 'Destination', 'Headsign', 'headsign', 'destination') ?? v?.pattern?.name ?? null,
    doorStatus: num(pick(v, 'DoorStatus', 'doorStatus')),
    isOnRoute: pick(v, 'IsOnRoute', 'isOnRoute', 'onRoute') ?? true,
  };
}

function normalizeArrival(a, group, stopId) {
  let seconds = num(pick(a, 'SecondsToArrival', 'secondsToArrival', 'SecondsUntilArrival', 'secondsUntilArrival', 'Seconds', 'seconds'));
  if (seconds === null) {
    const minutes = num(pick(a, 'Minutes', 'MinutesToArrival', 'minutes', 'minutesToArrival'));
    if (minutes !== null) seconds = minutes * 60;
  }
  const route = a?.route || a?.pattern?.route || null;
  const vehicle = a?.vehicle && typeof a.vehicle === 'object' ? a.vehicle : null;
  const vehicleId = vehicle?.id ?? pick(a, 'VehicleID', 'VehicleId', 'vehicleId', 'BusID', 'BusId') ?? null;
  const predicted = parseSyncroDate(
    pick(a, 'ArriveTime', 'PredictedArrivalTime', 'EstimatedArrivalTime', 'predictedArrivalTime', 'predictedArrival', 'arrivalTime', 'eta', 'expectedArrival')
  );
  return {
    stopId: pick(a, 'StopId', 'StopID', 'stopId') ?? a?.stop?.id ?? stopId,
    routeId: pick(a, 'RouteID', 'RouteId', 'routeId') ?? route?.id ?? pick(group, 'RouteID', 'RouteId', 'ID', 'id') ?? null,
    routeName: pick(a, 'RouteName', 'routeName') ?? route?.name ?? pick(group, 'RouteName', 'Name', 'name') ?? null,
    routeShortName: route?.shortName ?? pick(a, 'routeShortName') ?? null,
    color: normalizeColor(pick(a, 'Color', 'color') ?? route?.color ?? pick(group, 'Color'), null),
    vehicleId,
    vehicleName:
      vehicle?.name ?? vehicle?.label ?? pick(a, 'VehicleName', 'BusName', 'vehicleName') ?? (vehicleId !== null ? String(vehicleId) : null),
    secondsToArrival: seconds,
    minutes: seconds === null ? null : Math.max(0, Math.round(seconds / 60)),
    predictedAt: predicted ?? (seconds === null ? null : new Date(Date.now() + seconds * 1000).toISOString()),
    scheduledAt: parseSyncroDate(
      pick(a, 'ScheduledArrivalTime', 'ScheduledTime', 'scheduledArrivalTime', 'scheduledArrival', 'scheduledTime') ?? a?.schedulePrediction?.scheduledTime
    ),
    direction: a?.pattern?.direction ?? pick(a, 'Direction', 'DirectionName', 'direction') ?? null,
    destination: pick(a, 'Destination', 'Headsign', 'headsign', 'destination') ?? (a?.pattern?.name && a.pattern.name !== 'Pattern' ? a.pattern.name : null),
    patternId: a?.pattern?.id ?? pick(a, 'PatternId', 'patternId') ?? null,
    isLastStop: Boolean(pick(a, 'IsLastStop', 'isLastStop')),
    // true when the prediction comes from the timetable rather than a tracked bus
    isScheduled: pick(a, 'schedulePrediction', 'isScheduled', 'scheduled', 'isSchedule') === true,
    deviationSeconds: num(pick(a, 'Deviation', 'deviation', 'deviationSeconds')),
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
// Data access (mock-aware). "portal" = kenoshatransit.com/api/rtpi proxy,
// "track" = classic Syncromatics Track endpoints. Auto picks whichever answers.
// ---------------------------------------------------------------------------

let routesCache = { at: 0, routes: null, style: null };

function looksLikeRoutes(list) {
  return list.length > 0 && list.every((r) => r && typeof r === 'object');
}

async function portalRoutes() {
  // 1. The proxy may expose the list directly.
  try {
    const list = unwrapList(await fetchPortal('routes'));
    if (looksLikeRoutes(list)) return list.map(normalizeRoute).filter((r) => r.id !== undefined && r.id !== null);
  } catch {
    // fall through
  }
  // 2. Otherwise it is server-rendered into the HTML shell.
  const html = await fetchUpstream('/', { raw: true });
  const list = routesFromHydration(html);
  if (!looksLikeRoutes(list)) {
    throw new UpstreamError('Could not find the route list in the site page data (hydration payload)', 502);
  }
  return list.map(normalizeRoute).filter((r) => r.id !== undefined && r.id !== null);
}

async function trackRoutesForRegion(regionId) {
  const raw = await fetchUpstream(`/Region/${encodeURIComponent(regionId)}/Routes`);
  const list = Array.isArray(raw) ? raw : raw?.Routes || raw?.routes || [];
  return list.map(normalizeRoute).filter((r) => r.id !== undefined && r.id !== null);
}

async function trackRoutes() {
  let firstError = null;
  try {
    const routes = await trackRoutesForRegion(REGION_ID);
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
  const results = await Promise.allSettled(regions.map((id) => trackRoutesForRegion(id)));
  for (const r of results) if (r.status === 'fulfilled') for (const route of r.value) merged.set(String(route.id), route);
  if (merged.size) return [...merged.values()];
  if (firstError) throw firstError;
  throw new UpstreamError(`Kenosha Transit API listed ${regions.length} region(s) but none had routes`, 502);
}

async function portalStopsForRoute(routeId) {
  const list = unwrapList(await fetchPortal(`routes/${encodeURIComponent(routeId)}/stops`));
  return list.map((s) => normalizeStop(s, routeId)).filter(validStop);
}

async function trackStopsForRoute(routeId) {
  const raw = await fetchUpstream(`/Route/${encodeURIComponent(routeId)}/Direction/0/Stops`);
  const list = Array.isArray(raw) ? raw : raw?.Stops || [];
  return list.map((s) => normalizeStop(s, routeId)).filter(validStop);
}

/** Which API flavour to use: env override, else whatever loaded the routes. */
function apiStyle() {
  if (API_STYLE === 'portal' || API_STYLE === 'track') return API_STYLE;
  return routesCache.style || 'portal';
}

export async function getRoutes({ force = false } = {}) {
  if (isMock()) return mock.routes().map(normalizeRoute);

  const now = Date.now();
  if (!force && routesCache.routes && now - routesCache.at < ROUTES_TTL_MS) return routesCache.routes;

  let routes;
  let style;
  if (API_STYLE === 'track') {
    routes = await trackRoutes();
    style = 'track';
  } else if (API_STYLE === 'portal') {
    routes = await portalRoutes();
    style = 'portal';
  } else {
    try {
      routes = await portalRoutes();
      style = 'portal';
    } catch (portalErr) {
      try {
        routes = await trackRoutes();
        style = 'track';
      } catch {
        throw portalErr;
      }
    }
  }

  routes.sort(
    (a, b) =>
      Number(a.isSchool) - Number(b.isSchool) ||
      (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
      String(a.shortName).localeCompare(String(b.shortName), undefined, { numeric: true })
  );

  await Promise.allSettled(
    routes
      .filter((r) => r.stops.length === 0)
      .map(async (r) => {
        r.stops = style === 'portal' ? await portalStopsForRoute(r.id) : await trackStopsForRoute(r.id);
      })
  );

  routesCache = { at: now, routes, style };
  return routes;
}

export async function getVehicles(routeId) {
  if (isMock()) {
    return mock
      .vehicles(routeId)
      .map((v) => normalizeVehicle(v, routeId))
      .filter((v) => v.id !== undefined && v.id !== null && v.lat !== null && v.lng !== null);
  }
  if (!routesCache.routes && API_STYLE === 'auto') await getRoutes().catch(() => {});
  const raw =
    apiStyle() === 'portal'
      ? await fetchPortal(`routes/${encodeURIComponent(routeId)}/vehicles`)
      : await fetchUpstream(`/Route/${encodeURIComponent(routeId)}/Vehicles`);
  const list = apiStyle() === 'portal' ? unwrapList(raw) : Array.isArray(raw) ? raw : raw?.Vehicles || [];
  return list
    .map((v) => normalizeVehicle(v, routeId))
    .filter((v) => v.id !== undefined && v.id !== null && v.lat !== null && v.lng !== null);
}

export async function getArrivals(stopId, routeId = null) {
  if (isMock()) return normalizeArrivals(mock.arrivals(stopId), stopId);
  if (!routesCache.routes && API_STYLE === 'auto') await getRoutes().catch(() => {});
  if (apiStyle() === 'portal') {
    const query = routeId ? `?routeId=${encodeURIComponent(routeId)}` : '';
    const raw = await fetchPortal(`stops/${encodeURIComponent(stopId)}/arrivals${query}`);
    return normalizeArrivals(unwrapList(raw), stopId);
  }
  const query = CUSTOMER_ID ? `?customerId=${encodeURIComponent(CUSTOMER_ID)}` : '';
  const raw = await fetchUpstream(`/Stop/${encodeURIComponent(stopId)}/Arrivals${query}`);
  return normalizeArrivals(raw, stopId);
}

/** GeoJSON Feature (MultiLineString) for a route, or null when no shape exists. */
export async function getTrace(routeId) {
  if (isMock()) return mock.trace(routeId);

  const routes = await getRoutes();
  const route = routes.find((r) => String(r.id) === String(routeId));
  if (!route) return null;

  let lines = [];
  if (apiStyle() === 'portal') {
    const seen = new Set();
    for (const path of [`routes/${routeId}/patterns`, `routes/${routeId}/shapes`, `routes/${routeId}/paths`, `routes/${routeId}/geometry`]) {
      try {
        const raw = await fetchPortal(path);
        const items = unwrapList(raw);
        const candidates = items.length ? items : [raw];
        for (const item of candidates) {
          for (const line of shapeToLines(item)) {
            const key = `${line.length}:${line[0]}:${line[line.length - 1]}`;
            if (!seen.has(key)) {
              seen.add(key);
              lines.push(line);
            }
          }
        }
      } catch {
        // try the next path
      }
      if (lines.length) break;
    }
  } else if (route.traceFile) {
    const kml = await fetchUpstream(`/Resources/Traces/${encodeURIComponent(route.traceFile)}`, { raw: true });
    lines = kmlToLines(kml);
  }

  if (!lines.length) return null;
  return {
    type: 'Feature',
    properties: { routeId: route.id, color: route.color, name: route.name },
    geometry: { type: 'MultiLineString', coordinates: lines },
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
