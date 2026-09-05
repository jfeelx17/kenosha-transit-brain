// Prediction log: the seed of the "trust layer".
//
// Every arrivals poll for a trip stop appends compact rows; when a vehicle that
// was about to arrive disappears from the predictions, an "arrived" row is
// written. Kept on device in a capped ring buffer, exportable as JSON, so
// months of evidence about which buses run on time can be analysed later.
//
// Row: { t: fetchedAt (epoch s), s: stopId, r: routeId, v: vehicleId|null, eta: seconds, sch: 0|1 }
// Arrival row: { t, s, r, v, arrived: 1 }

export const LOG_KEY = 'kenosha-loop:prediction-log:v1';
export const LAST_SEEN_KEY = 'kenosha-loop:prediction-lastseen:v1';
export const MAX_ROWS = 5000; // roughly 400 KB of localStorage
const ARRIVING_WINDOW_S = 45;

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: drop silently, this is evidence, not the product
  }
}

export function count() {
  return read(LOG_KEY, []).length;
}

export function exportAll() {
  return read(LOG_KEY, []);
}

export function clear() {
  write(LOG_KEY, []);
  write(LAST_SEEN_KEY, {});
}

/**
 * Record one poll. `arrivals` are normalized rows for `stopId`; `fetchedAt` is epoch ms.
 * Returns the number of rows appended.
 */
export function record(stopId, arrivals, fetchedAt = Date.now()) {
  if (typeof window === 'undefined' || !Array.isArray(arrivals)) return 0;
  const t = Math.round(fetchedAt / 1000);
  const s = String(stopId);
  const rows = [];
  const seenNow = new Set();

  for (const a of arrivals) {
    if (a.secondsToArrival === null || a.secondsToArrival === undefined) continue;
    const v = a.vehicleId != null ? String(a.vehicleId) : null;
    rows.push({ t, s, r: a.routeId != null ? String(a.routeId) : null, v, eta: Math.round(a.secondsToArrival), sch: a.isScheduled ? 1 : 0 });
    if (v) seenNow.add(v);
  }

  // A tracked bus that was within ARRIVING_WINDOW_S and is now gone has arrived (or passed).
  const lastSeen = read(LAST_SEEN_KEY, {});
  const key = s;
  const prev = lastSeen[key] || {};
  const next = {};
  for (const a of arrivals) {
    if (a.vehicleId == null || a.secondsToArrival === null) continue;
    next[String(a.vehicleId)] = { eta: Math.round(a.secondsToArrival), r: a.routeId != null ? String(a.routeId) : null, t };
  }
  for (const [v, info] of Object.entries(prev)) {
    if (!seenNow.has(v) && info.eta <= ARRIVING_WINDOW_S && t - info.t <= 180) {
      rows.push({ t, s, r: info.r, v, arrived: 1 });
    }
  }
  lastSeen[key] = next;
  write(LAST_SEEN_KEY, lastSeen);

  if (!rows.length) return 0;
  const log = read(LOG_KEY, []);
  log.push(...rows);
  if (log.length > MAX_ROWS) log.splice(0, log.length - MAX_ROWS);
  write(LOG_KEY, log);
  return rows.length;
}
