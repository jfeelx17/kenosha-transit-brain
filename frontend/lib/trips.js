// Trips: "this stop, these routes, my walk time". The Butler's input.
// Personal data: lives only in this browser's localStorage (see docs/MILESTONES.md, v0.3 lens).
import { useCallback, useEffect, useState } from 'react';

export const TRIPS_KEY = 'kenosha-loop:trips:v1';

export function loadTrips() {
  try {
    const raw = window.localStorage.getItem(TRIPS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((t) => t && t.id && t.stopId != null) : [];
  } catch {
    return [];
  }
}

export function saveTrips(list) {
  try {
    window.localStorage.setItem(TRIPS_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable: trips live for this page load only
  }
}

/** Stable id so saving the same stop+routes again updates instead of duplicating. */
export function tripIdFor(stopId, routeIds = []) {
  const routes = [...routeIds].map(String).sort().join('+') || 'any';
  return `${stopId}:${routes}`;
}

export function makeTrip({ stop, routeIds = [], walkSeconds, bufferSeconds = 60, name }) {
  return {
    id: tripIdFor(stop.id, routeIds),
    name: name || stop.name,
    stopId: String(stop.id),
    stopName: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    routeIds: [...routeIds].map(String),
    walkSeconds: Math.max(0, Math.round(walkSeconds || 0)),
    bufferSeconds: Math.max(0, Math.round(bufferSeconds)),
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

/** React hook: [trips, saveTrip(trip), removeTrip(id)] */
export function useTrips() {
  const [trips, setTrips] = useState([]);
  useEffect(() => {
    setTrips(loadTrips());
  }, []);

  const saveTrip = useCallback((trip) => {
    setTrips((prev) => {
      const next = prev.some((t) => t.id === trip.id) ? prev.map((t) => (t.id === trip.id ? { ...t, ...trip } : t)) : [...prev, trip];
      saveTrips(next);
      return next;
    });
  }, []);

  const removeTrip = useCallback((id) => {
    setTrips((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveTrips(next);
      return next;
    });
  }, []);

  return [trips, saveTrip, removeTrip];
}
