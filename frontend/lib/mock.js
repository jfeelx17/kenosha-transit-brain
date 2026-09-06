// Fake Kenosha Transit data for offline development and testing.
//
// Enabled with KENOSHA_MOCK=1. The shapes below deliberately mimic the raw
// GMV Syncromatics "Track" API (PascalCase keys, "/Date(ms)/" timestamps,
// nested Arrivals) so the exact same normalizers in lib/transit.js run in
// both modes. Buses move along their route continuously based on the clock.

const TRANSIT_CENTER = { ID: 100, Name: 'Kenosha Transit Center (54th St)', Latitude: 42.5838, Longitude: -87.8205 };

const ROUTES = [
  {
    ID: 1,
    Name: 'Route 1 - Sheridan Rd',
    ShortName: '1',
    Color: '#ef4444',
    periodSeconds: 1500,
    vehicles: [{ ID: 1601, offset: 0.05 }, { ID: 1602, offset: 0.55 }],
    Stops: [
      { ID: 101, Name: 'Carthage College', Latitude: 42.6188, Longitude: -87.8225 },
      { ID: 102, Name: 'Sheridan Rd & 35th St', Latitude: 42.6045, Longitude: -87.818 },
      { ID: 103, Name: 'Sheridan Rd & 45th St', Latitude: 42.595, Longitude: -87.818 },
      TRANSIT_CENTER,
      { ID: 104, Name: 'Sheridan Rd & 60th St', Latitude: 42.58, Longitude: -87.8165 },
      { ID: 106, Name: 'Sheridan Rd & 75th St', Latitude: 42.5655, Longitude: -87.8165 },
      { ID: 107, Name: 'Southport Beach', Latitude: 42.556, Longitude: -87.815 },
    ],
  },
  {
    ID: 2,
    Name: 'Route 2 - 52nd St',
    ShortName: '2',
    Color: '#3b82f6',
    periodSeconds: 1200,
    vehicles: [{ ID: 1701, offset: 0.2 }, { ID: 1702, offset: 0.7 }],
    Stops: [
      TRANSIT_CENTER,
      { ID: 201, Name: '52nd St & 22nd Ave', Latitude: 42.5878, Longitude: -87.829 },
      { ID: 202, Name: '52nd St & 30th Ave', Latitude: 42.5878, Longitude: -87.84 },
      { ID: 203, Name: '52nd St & 39th Ave', Latitude: 42.5878, Longitude: -87.852 },
      { ID: 204, Name: '52nd St & 52nd Ave', Latitude: 42.5878, Longitude: -87.869 },
      { ID: 205, Name: '52nd St & 60th Ave', Latitude: 42.5878, Longitude: -87.88 },
      { ID: 206, Name: 'Green Bay Rd & 52nd St', Latitude: 42.5878, Longitude: -87.888 },
    ],
  },
  {
    ID: 3,
    Name: 'Route 3 - 60th St / 75th St',
    ShortName: '3',
    Color: '#22c55e',
    periodSeconds: 1400,
    vehicles: [{ ID: 1801, offset: 0.35 }],
    Stops: [
      TRANSIT_CENTER,
      { ID: 301, Name: '60th St & 22nd Ave', Latitude: 42.58, Longitude: -87.829 },
      { ID: 302, Name: '60th St & 30th Ave', Latitude: 42.58, Longitude: -87.84 },
      { ID: 303, Name: '60th St & 39th Ave', Latitude: 42.58, Longitude: -87.852 },
      { ID: 304, Name: '60th St & 52nd Ave', Latitude: 42.58, Longitude: -87.869 },
      { ID: 305, Name: 'Pershing Blvd & 75th St', Latitude: 42.5655, Longitude: -87.87 },
      { ID: 306, Name: '75th St & 39th Ave', Latitude: 42.5655, Longitude: -87.852 },
      { ID: 307, Name: '75th St & 22nd Ave', Latitude: 42.5655, Longitude: -87.829 },
      { ID: 106, Name: 'Sheridan Rd & 75th St', Latitude: 42.5655, Longitude: -87.8165 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Geometry helpers (planar approximation is plenty for a 10 km wide city)
// ---------------------------------------------------------------------------

function segmentLength(a, b) {
  const dx = (b.Longitude - a.Longitude) * Math.cos((a.Latitude * Math.PI) / 180);
  const dy = b.Latitude - a.Latitude;
  return Math.hypot(dx, dy);
}

function bearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const lat1 = toRad(a.Latitude);
  const lat2 = toRad(b.Latitude);
  const dLng = toRad(b.Longitude - a.Longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// A closed loop: visit every stop in order, then head back to the first one.
function buildPath(route) {
  const points = [...route.Stops, route.Stops[0]];
  const cumulative = [0];
  for (let i = 0; i < points.length - 1; i++) {
    cumulative.push(cumulative[i] + segmentLength(points[i], points[i + 1]));
  }
  return { points, cumulative, total: cumulative[cumulative.length - 1] };
}

const PATHS = new Map(ROUTES.map((r) => [r.ID, buildPath(r)]));

function pointAt(path, progress) {
  const distance = (((progress % 1) + 1) % 1) * path.total;
  let i = 0;
  while (i < path.cumulative.length - 2 && path.cumulative[i + 1] <= distance) i++;
  const a = path.points[i];
  const b = path.points[i + 1];
  const span = path.cumulative[i + 1] - path.cumulative[i] || 1;
  const t = (distance - path.cumulative[i]) / span;
  return {
    Latitude: +(a.Latitude + (b.Latitude - a.Latitude) * t).toFixed(6),
    Longitude: +(a.Longitude + (b.Longitude - a.Longitude) * t).toFixed(6),
    Heading: bearing(a, b),
  };
}

function progressOf(route, vehicle, nowMs) {
  return (nowMs / 1000 / route.periodSeconds + vehicle.offset) % 1;
}

function stopProgress(route, stopIndex) {
  const path = PATHS.get(route.ID);
  return path.cumulative[stopIndex] / path.total;
}

function loadPercent(vehicleId, nowMs) {
  // Slow sine wave per vehicle so the crowd meter visibly changes over minutes.
  const wave = Math.sin(nowMs / 90000 + vehicleId);
  return Math.round(Math.min(95, Math.max(5, 50 + 40 * wave)));
}

const syncroDate = (ms) => `/Date(${ms}-0500)/`;

// ---------------------------------------------------------------------------
// Raw API shapes
// ---------------------------------------------------------------------------

export function routes() {
  return ROUTES.map((r) => ({
    ID: r.ID,
    Name: r.Name,
    ShortName: r.ShortName,
    Color: r.Color,
    TextColor: '#ffffff',
    IsRunning: true,
    RouteTraceFilename: `mock-route-${r.ID}.kml`,
    Stops: r.Stops.map((s, i) => ({ ...s, Order: i + 1, RouteId: r.ID })),
  }));
}

export function vehicles(routeId, nowMs = Date.now()) {
  const route = ROUTES.find((r) => String(r.ID) === String(routeId));
  if (!route) return [];
  const path = PATHS.get(route.ID);
  return route.vehicles.map((v) => {
    const pos = pointAt(path, progressOf(route, v, nowMs));
    const apc = loadPercent(v.ID, nowMs);
    return {
      ID: v.ID,
      Name: String(v.ID),
      RouteId: route.ID,
      Latitude: pos.Latitude,
      Longitude: pos.Longitude,
      Heading: pos.Heading,
      Speed: 22,
      LastUpdated: syncroDate(nowMs - 4000),
      APCPercentage: apc,
      Capacity: 40,
      OnBoard: Math.round((apc / 100) * 40),
      Destination: route.Stops[route.Stops.length - 1].Name,
      DoorStatus: 0,
      IsOnRoute: true,
    };
  });
}

export function arrivals(stopId, nowMs = Date.now()) {
  const groups = [];
  for (const route of ROUTES) {
    const stopIndex = route.Stops.findIndex((s) => String(s.ID) === String(stopId));
    if (stopIndex === -1) continue;
    const target = stopProgress(route, stopIndex);
    const list = route.vehicles.map((v) => {
      const p = progressOf(route, v, nowMs);
      const delta = (target - p + 1) % 1;
      const seconds = Math.round(delta * route.periodSeconds);
      const eta = nowMs + seconds * 1000;
      return {
        VehicleID: v.ID,
        VehicleName: String(v.ID),
        RouteID: route.ID,
        RouteName: route.Name,
        StopId: Number(stopId),
        SecondsToArrival: seconds,
        Minutes: Math.round(seconds / 60),
        ArriveTime: syncroDate(eta),
        ScheduledArrivalTime: syncroDate(eta + 45000),
        Direction: stopIndex < route.Stops.length / 2 ? 'Outbound' : 'Inbound',
        Destination: route.Stops[route.Stops.length - 1].Name,
        IsOnRoute: true,
        IsLastStop: stopIndex === route.Stops.length - 1,
        Deviation: -45,
      };
    });
    groups.push({ RouteID: route.ID, RouteName: route.Name, Color: route.Color, StopId: Number(stopId), Arrivals: list });
  }
  return groups;
}

export function nearby(lat, lon, distanceM = 1500) {
  const seen = new Set();
  const out = [];
  for (const r of ROUTES) {
    for (const s of r.Stops) {
      if (seen.has(s.ID)) continue;
      seen.add(s.ID);
      const dx = (s.Longitude - lon) * Math.cos((lat * Math.PI) / 180) * 111320;
      const dy = (s.Latitude - lat) * 110540;
      const d = Math.round(Math.hypot(dx, dy));
      if (d <= distanceM) out.push({ id: s.ID, name: s.Name, lat: s.Latitude, lon: s.Longitude, stopCode: String(s.ID), rtpiNumber: String(s.ID), distance: d });
    }
  }
  return out.sort((a, b) => a.distance - b.distance);
}

export function trace(routeId) {
  const route = ROUTES.find((r) => String(r.ID) === String(routeId));
  if (!route) return null;
  return {
    type: 'Feature',
    properties: { routeId: route.ID, color: route.Color, name: route.Name },
    geometry: {
      type: 'MultiLineString',
      coordinates: [route.Stops.map((s) => [s.Longitude, s.Latitude])],
    },
  };
}

// Service alerts in the raw shape of the vendor's page data (see normalizeAlert in transit.js):
// one urgent system-wide notice covering right now, and one standing route notice, so the alert
// UI and the Butler's "no bus, and here is why" path can be exercised offline.
export function alerts(nowMs = Date.now()) {
  const iso = (ms) => new Date(ms).toISOString().replace('Z', '+00:00');
  const DAY = 86400000;
  const routeRefs = ROUTES.map((r) => ({ id: r.ID, name: r.Name, shortName: r.ShortName, color: r.Color, textColor: '#FFFFFF' }));
  return [
    {
      id: 90001,
      name: 'No bus service on Labor day',
      text: 'There will be no bus service on Labor day. Service resumes the next weekday.',
      start: iso(nowMs - 2 * DAY),
      end: iso(nowMs + 2 * DAY),
      appMessage: [
        {
          id: 1,
          overrideTitle: 'No bus service on Labor day',
          overrideText: 'There will be no bus service on Labor day.\nService resumes the next weekday.',
          sendViaNativePush: true,
          sendTime: null,
        },
      ],
      webAnnouncementMessages: [],
      assignments: { global: false, routeTypes: [], stops: [], routes: routeRefs, tags: [] },
    },
    {
      id: 90002,
      name: 'Pick N Save 75th St - moved stop',
      text: 'We will no longer be going into the Pick n Save parking lot. The stop is on 57th Ave southbound.',
      start: iso(nowMs - 300 * DAY),
      end: iso(nowMs + 300 * DAY),
      appMessage: [{ id: 2, overrideTitle: null, overrideText: null, sendViaNativePush: false, sendTime: null }],
      webAnnouncementMessages: [],
      assignments: {
        global: false,
        routeTypes: [],
        stops: [{ id: 201, name: '52nd St & 22nd Ave', stopCode: '', rtpiNumber: '201' }],
        routes: [routeRefs[1]],
        tags: [],
      },
    },
  ];
}
