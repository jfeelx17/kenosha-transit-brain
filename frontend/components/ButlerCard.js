import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchJson } from '../lib/client';
import { usePolling } from '../hooks/usePolling';
import { useNow } from '../hooks/useNow';
import { adviseTrip, describeAdvice } from '../lib/butler';
import { notify, permissionState, requestPermission, vibrate } from '../lib/notify';
import { record as recordPredictions } from '../lib/predictionLog';
import { distanceMeters } from '../lib/geo';
import { alertsForRoutes } from '../lib/alerts';
import { alertWindow } from '../lib/format';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_ARRIVALS_MS) || 15000;
const ALERTED_KEY = 'kenosha-loop:alerted:v1';

// One buzz per bus, even though this card unmounts every time a sheet opens.
// sessionStorage, not state: it must survive a remount but not tomorrow morning.
function alreadyAlerted(key) {
  try {
    return JSON.parse(window.sessionStorage.getItem(ALERTED_KEY) || '[]').includes(key);
  } catch {
    return false;
  }
}

function markAlerted(key) {
  try {
    const list = JSON.parse(window.sessionStorage.getItem(ALERTED_KEY) || '[]');
    list.push(key);
    window.sessionStorage.setItem(ALERTED_KEY, JSON.stringify(list.slice(-40)));
  } catch {
    // no storage: worst case the same bus buzzes twice
  }
}

/**
 * The Butler card: for your active trip, "Leave in 7 min", counting down,
 * with a vibration + notification when it is time to go.
 *
 * Active trip = the enabled trip whose stop is nearest to you (or the first one).
 */
export default function ButlerCard({ trips, alerts = [], routesById, vehiclesById, userPos, onOpenTrip }) {
  const now = useNow(1000);
  const [perm, setPerm] = useState('default');
  const alertedRef = useRef(new Set());

  useEffect(() => {
    setPerm(permissionState());
  }, []);

  const trip = useMemo(() => {
    const enabled = (trips || []).filter((t) => t.enabled !== false);
    if (!enabled.length) return null;
    if (!userPos) return enabled[0];
    return [...enabled].sort((a, b) => distanceMeters(userPos, a) - distanceMeters(userPos, b))[0];
  }, [trips, userPos]);

  const arrivalsState = usePolling(
    `butler:${trip?.stopId ?? ''}`,
    () => fetchJson(`/api/arrivals/${encodeURIComponent(trip.stopId)}`),
    POLL_MS,
    { enabled: Boolean(trip), keepPrevious: true }
  );

  // Evidence for the trust layer: every poll of a trip stop is logged on-device.
  useEffect(() => {
    if (trip && arrivalsState.data?.arrivals && arrivalsState.updatedAt) {
      recordPredictions(trip.stopId, arrivalsState.data.arrivals, arrivalsState.updatedAt);
    }
  }, [trip, arrivalsState.data, arrivalsState.updatedAt]);

  const advice = useMemo(() => {
    if (!trip || !arrivalsState.data) return null;
    return adviseTrip({
      trip,
      arrivals: arrivalsState.data.arrivals || [],
      vehiclesById,
      now,
      fetchedAt: arrivalsState.updatedAt || now,
    });
  }, [trip, arrivalsState.data, arrivalsState.updatedAt, vehiclesById, now]);

  // "No bus to catch" is a dead end. If the agency has posted something covering this trip's
  // routes, that is almost always the reason, so say it rather than leaving you guessing.
  const tripAlert = useMemo(() => {
    if (!trip) return null;
    const matching = alertsForRoutes(alerts, trip.routeIds || []);
    return matching.find((a) => a.urgent) || matching[0] || null;
  }, [alerts, trip]);

  const route = advice?.arrival ? routesById.get(String(advice.arrival.routeId)) : null;
  const routeLabel = route ? `Route ${route.shortLabel || route.shortName}` : undefined;
  const text = describeAdvice(advice, routeLabel);
  if (advice?.state === 'no-bus' && tripAlert) {
    text.title = tripAlert.title;
    text.detail = tripAlert.urgent ? `No bus to catch · ${alertWindow(tripAlert)}` : 'No bus to catch right now.';
  }

  // Alert once per bus when it becomes time to go.
  useEffect(() => {
    if (!advice || !(advice.state === 'leave-now' || advice.state === 'hurry')) return;
    const key = `${trip.id}:${advice.arrival?.vehicleId ?? advice.arrival?.predictedAt ?? 'x'}`;
    if (alertedRef.current.has(key) || alreadyAlerted(key)) return;
    alertedRef.current.add(key);
    markAlerted(key);
    vibrate();
    notify(text.title, { body: `${trip.stopName}: ${text.detail}`, tag: `butler-${trip.id}` });
  }, [advice?.state, advice?.arrival?.vehicleId, trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trip) return null;

  const enableAlerts = async (e) => {
    e.stopPropagation();
    setPerm(await requestPermission());
  };

  const state = advice?.state || (arrivalsState.error ? 'error' : 'loading');
  const walkMin = Math.round(trip.walkSeconds / 60);

  return (
    <section className={`butler butler--${state}`} role="status" aria-live="polite" onClick={() => onOpenTrip(trip)}>
      <div className="butler__main">
        <div className="butler__title">
          {state === 'loading' && 'Checking your bus…'}
          {state === 'error' && "Can't reach the bus feed"}
          {advice && text.title}
        </div>
        <div className="butler__detail">
          {state === 'error' ? arrivalsState.error?.message : advice ? text.detail : trip.stopName}
        </div>
        <div className="butler__meta">
          {trip.stopName} · {walkMin} min walk
          {advice?.missed?.length ? ` · ${advice.missed.length} too soon to catch` : ''}
          {advice?.next && advice.next.secondsToArrival != null ? ` · next in ${Math.round(advice.next.secondsToArrival / 60)} min` : ''}
        </div>
      </div>
      {perm === 'default' && (
        <button type="button" className="butler__bell" onClick={enableAlerts} title="Vibrate and notify me when it's time to leave">
          🔔 Alerts
        </button>
      )}
      {perm === 'denied' && <span className="butler__bell butler__bell--off" title="Notifications are blocked for this site in your browser settings">🔕</span>}
    </section>
  );
}
