// Service alerts: pure functions over the vendor's "messages" records.
//
// Kept apart from transit.js because components need the matchers and transit.js must never be
// imported from the browser (it holds the upstream fetching). Nothing here touches the network.
//
// Record shape, confirmed against the live payload on 2026-09-06 and frozen in
// lib/fixtures/transit-hydration.json:
//
//   { id, name, text, start, end,
//     appMessage: [{ overrideTitle, overrideText, sendViaNativePush }],
//     webAnnouncementMessages: [{ overrideTitle, displayableMarkUpText }],
//     assignments: { global, routeTypes, stops[{id,name,rtpiNumber}], routes[{id,shortName,...}], tags } }
//
// Dates carry a real offset ("2026-09-04T05:00:00+00:00" is local midnight), so plain instant
// comparison is correct and no timezone handling is needed.

// Everything the agency posts is "active" for as long as they leave it up, and most of it is a
// standing notice running for a year or more (fare rules, a stop that moved last autumn). Only a
// short window means "this affects your day": a holiday, a detour, a one-day closure.
const URGENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function normalizeAlert(m) {
  const app = Array.isArray(m?.appMessage) ? m.appMessage[0] : null;
  const web = Array.isArray(m?.webAnnouncementMessages) ? m.webAnnouncementMessages[0] : null;
  const assignments = m?.assignments || {};
  const startsAt = m?.start ? new Date(m.start).toISOString() : null;
  const endsAt = m?.end ? new Date(m.end).toISOString() : null;
  const span = startsAt && endsAt ? Date.parse(endsAt) - Date.parse(startsAt) : Infinity;
  const routes = Array.isArray(assignments.routes) ? assignments.routes : [];
  const stops = Array.isArray(assignments.stops) ? assignments.stops : [];

  return {
    id: m?.id ?? null,
    // The app override is the copy the agency wrote for a small screen; it keeps line breaks.
    title: (app?.overrideTitle || web?.overrideTitle || m?.name || 'Service notice').trim(),
    text: String(app?.overrideText || m?.text || '').trim(),
    startsAt,
    endsAt,
    urgent: span <= URGENT_WINDOW_MS,
    global: assignments.global === true,
    pushWorthy: app?.sendViaNativePush === true,
    routeIds: routes.map((r) => String(r.id)),
    routeLabels: routes.map((r) => r.shortName || r.name).filter(Boolean),
    stopIds: stops.map((st) => String(st.id)),
    stopRtpiNumbers: stops.map((st) => st.rtpiNumber).filter((n) => n !== null && n !== undefined && n !== '').map(String),
    stopNames: stops.map((st) => st.name).filter(Boolean),
  };
}

/** Is this alert in force at `now`? */
export function alertIsActive(a, now = Date.now()) {
  const t = typeof now === 'number' ? now : now.getTime();
  if (a.startsAt && Date.parse(a.startsAt) > t) return false;
  if (a.endsAt && Date.parse(a.endsAt) < t) return false;
  return true;
}

/** Urgent first, then the ones the agency thought worth a push, then most recently posted. */
export function sortAlerts(list) {
  return [...list].sort(
    (a, b) =>
      Number(b.urgent) - Number(a.urgent) ||
      Number(b.pushWorthy) - Number(a.pushWorthy) ||
      Date.parse(b.startsAt || 0) - Date.parse(a.startsAt || 0)
  );
}

/**
 * Only an explicitly global notice applies everywhere.
 *
 * Do not infer it from "assigned to lots of routes". The 2026 Labor Day notice is posted against
 * the seven numbered bus routes and says in its own text that the streetcar runs as normal, so
 * treating a widely-assigned alert as system-wide would tell a streetcar rider there is no
 * service when there is. Trust the assignment, nothing else.
 */
export function isSystemWide(a) {
  return a?.global === true;
}

/** Alerts that apply to one stop: assigned to it directly, or to a route that serves it. */
export function alertsForStop(alerts, stop) {
  if (!stop) return [];
  const id = String(stop.id);
  const rtpi = stop.rtpiNumber != null ? String(stop.rtpiNumber) : null;
  const routeIds = (stop.routeIds || []).map(String);
  return (alerts || []).filter((a) => {
    if (isSystemWide(a)) return true;
    if (a.stopIds.includes(id)) return true;
    if (rtpi && a.stopRtpiNumbers.includes(rtpi)) return true;
    return routeIds.some((r) => a.routeIds.includes(r));
  });
}

/** Alerts that apply to one route. */
export function alertsForRoute(alerts, routeId) {
  const id = String(routeId);
  return (alerts || []).filter((a) => isSystemWide(a) || a.routeIds.includes(id));
}

/** Alerts that apply to any of a trip's routes (the Butler's "and here is why"). */
export function alertsForRoutes(alerts, routeIds = []) {
  const wanted = routeIds.map(String);
  return (alerts || []).filter((a) => isSystemWide(a) || a.routeIds.some((r) => wanted.includes(r)));
}
