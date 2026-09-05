import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../lib/client';
import { usePolling } from '../hooks/usePolling';
import { useNow } from '../hooks/useNow';
import { formatClock, formatEta, timeAgo } from '../lib/format';
import CrowdMeter from './CrowdMeter';

const POLL_ARRIVALS_MS = Number(process.env.NEXT_PUBLIC_POLL_ARRIVALS_MS) || 15000;
const POLL_VEHICLES_MS = Number(process.env.NEXT_PUBLIC_POLL_VEHICLES_MS) || 10000;

/**
 * "Next Bus" bottom sheet.
 *
 * Polls /api/arrivals/{stopId} (-> kenoshatransit.com /Stop/{id}/Arrivals) and
 * lists every predicted bus soonest-first with minutes away, the predicted
 * clock time, and a Crowd Meter fed by APCPercentage from /Route/{id}/Vehicles.
 *
 * Props
 *  - stop:          { id, name, lat, lng, routeIds[] }   (from the tapped map feature)
 *  - routesById:    Map<string, route>                    (names, colours, short names)
 *  - vehiclesById:  Map<string, vehicle>                  (already polled by the map)
 *  - onClose():     dismiss the sheet
 */
export default function NextBusSheet({ stop, routesById, vehiclesById, onClose }) {
  const [expanded, setExpanded] = useState(true);
  const now = useNow(1000);

  const arrivalsState = usePolling(
    `arrivals:${stop.id}`,
    () => fetchJson(`/api/arrivals/${encodeURIComponent(stop.id)}`),
    POLL_ARRIVALS_MS
  );
  const arrivals = arrivalsState.data?.arrivals ?? [];

  // Crowd data: the map already polls vehicles for every visible route. Only
  // fetch the routes whose buses we do not have (e.g. a route toggled off).
  const missingRouteIds = useMemo(() => {
    const ids = new Set();
    for (const a of arrivals) {
      if (a.vehicleId != null && a.routeId != null && !vehiclesById.has(String(a.vehicleId))) {
        ids.add(String(a.routeId));
      }
    }
    return [...ids].sort();
  }, [arrivals, vehiclesById]);
  const missingKey = missingRouteIds.join(',');

  const extraVehicles = usePolling(
    `sheet-vehicles:${missingKey}`,
    async () => {
      const results = await Promise.allSettled(
        missingRouteIds.map((id) => fetchJson(`/api/vehicles/${encodeURIComponent(id)}`))
      );
      return results.flatMap((r) => (r.status === 'fulfilled' ? r.value.vehicles || [] : []));
    },
    POLL_VEHICLES_MS,
    { enabled: Boolean(missingKey), keepPrevious: true }
  );

  const findVehicle = (vehicleId) => {
    if (vehicleId == null) return null;
    const key = String(vehicleId);
    return vehiclesById.get(key) || extraVehicles.data?.find((v) => String(v.id) === key) || null;
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => setExpanded(true), [stop.id]);

  // Count down between polls so the minutes stay honest.
  const elapsedSeconds = arrivalsState.updatedAt ? (now - arrivalsState.updatedAt) / 1000 : 0;
  const stopRoutes = (stop.routeIds || []).map((id) => routesById.get(String(id))).filter(Boolean);
  const shown = expanded ? arrivals : arrivals.slice(0, 1);
  const firstLoad = arrivalsState.loading && !arrivalsState.data;

  return (
    <section className={`sheet ${expanded ? 'sheet--expanded' : 'sheet--peek'}`} aria-label={`Next buses at ${stop.name}`}>
      <button
        type="button"
        className="sheet__handle"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'Collapse' : 'Expand'}
      >
        <span />
      </button>

      <header className="sheet__header">
        <div className="sheet__title">
          <h2>{stop.name}</h2>
          <div className="sheet__routes">
            {stopRoutes.map((r) => (
              <span key={r.id} className="route-badge route-badge--sm" style={{ background: r.color, color: r.textColor }} title={r.name}>
                {r.shortLabel || r.shortName}
              </span>
            ))}
            <span className="sheet__stopid">Stop {stop.id}</span>
          </div>
        </div>
        <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="sheet__body">
        {firstLoad && (
          <ul className="arrivals" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="arrival arrival--skeleton" />
            ))}
          </ul>
        )}

        {arrivalsState.data && arrivals.length === 0 && (
          <p className="sheet__empty">
            No buses are predicted for this stop right now.
            <br />
            <small>Buses may not be running at this hour. Try another stop or check back later.</small>
          </p>
        )}

        {shown.length > 0 && (
          <ul className="arrivals">
            {shown.map((a, i) => {
              const route = routesById.get(String(a.routeId));
              const vehicle = findVehicle(a.vehicleId);
              const color = route?.color || a.color || '#38bdf8';
              const remaining = a.secondsToArrival - elapsedSeconds;
              const due = remaining <= 60;
              return (
                <li key={`${a.routeId}-${a.vehicleId}-${a.predictedAt}-${i}`} className={`arrival ${due ? 'arrival--due' : ''}`}>
                  <span className="route-badge" style={{ background: color, color: route?.textColor || '#fff' }} title={route?.name}>
                    {route?.shortLabel ?? route?.shortName ?? a.routeShortName ?? a.routeId ?? '?'}
                  </span>
                  <div className="arrival__main">
                    <div className="arrival__eta">
                      <strong>{formatEta(remaining)}</strong>
                      {a.predictedAt && <span className="arrival__clock">{formatClock(a.predictedAt)}</span>}
                      {a.isScheduled && (
                        <span className="badge badge--sched" title="From the timetable; no tracked bus yet">
                          scheduled
                        </span>
                      )}
                    </div>
                    <div className="arrival__sub">
                      {route?.name ?? a.routeName ?? 'Route'}
                      {a.direction ? ` · ${a.direction}` : ''}
                      {a.destination && a.destination !== a.direction ? ` → ${a.destination}` : ''}
                      {a.vehicleName ? ` · Bus ${a.vehicleName}` : ''}
                    </div>
                    <CrowdMeter
                      percentage={vehicle?.apcPercentage ?? null}
                      onBoard={vehicle?.onBoard}
                      capacity={vehicle?.capacity}
                      fallbackLabel={a.isScheduled && !vehicle ? 'Scheduled trip, no bus assigned yet' : undefined}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!expanded && arrivals.length > 1 && (
          <button type="button" className="sheet__more" onClick={() => setExpanded(true)}>
            +{arrivals.length - 1} more
          </button>
        )}
      </div>

      <footer className="sheet__footer">
        {arrivalsState.error ? (
          <span className="sheet__error">Couldn't refresh: {arrivalsState.error.message}</span>
        ) : (
          <span>
            {arrivalsState.updatedAt ? `Updated ${timeAgo(arrivalsState.updatedAt, now)}` : 'Loading…'} · refreshes every{' '}
            {Math.round(POLL_ARRIVALS_MS / 1000)}s
          </span>
        )}
        <button type="button" className="sheet__refresh" onClick={arrivalsState.refresh} aria-label="Refresh now">
          ↻
        </button>
      </footer>
    </section>
  );
}
