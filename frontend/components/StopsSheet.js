import { useMemo } from 'react';
import { fetchJson } from '../lib/client';
import { usePolling } from '../hooks/usePolling';
import { useNow } from '../hooks/useNow';
import { formatDistance, formatEta, timeAgo } from '../lib/format';

const POLL_ARRIVALS_MS = Number(process.env.NEXT_PUBLIC_POLL_ARRIVALS_MS) || 15000;

/**
 * Bottom sheet listing stops: the nearest ones to the rider ("nearby") or
 * the ones they starred ("saved"). Each row shows distance and the next bus.
 *
 * Props
 *  - mode: 'nearby' | 'saved'
 *  - stops: [{ id, name, lat, lng, distanceMeters?, routeIds? }]
 *  - loading / error: state of the nearby lookup
 *  - routesById: Map<string, route>
 *  - stopRouteIds: Map<string, string[]>  (stop id -> routes serving it)
 *  - onSelectStop(stop), onSwitchMode(mode), onRefresh(), onClose()
 */
export default function StopsSheet({ mode, stops, loading, error, routesById, stopRouteIds, savedCount, onSelectStop, onSwitchMode, onRefresh, onClose }) {
  const now = useNow(1000);
  const key = stops.map((s) => s.id).join(',');

  // Next bus at each listed stop (a handful of small requests, refreshed like the sheet).
  const nextState = usePolling(
    `stops-next:${key}`,
    async () => {
      const results = await Promise.allSettled(stops.map((s) => fetchJson(`/api/arrivals/${encodeURIComponent(s.id)}`)));
      const map = {};
      results.forEach((r, i) => {
        map[String(stops[i].id)] = r.status === 'fulfilled' ? r.value.arrivals?.[0] || null : undefined; // undefined = failed
      });
      return map;
    },
    POLL_ARRIVALS_MS,
    { enabled: stops.length > 0, keepPrevious: true }
  );
  const elapsed = nextState.updatedAt ? (now - nextState.updatedAt) / 1000 : 0;

  const title = mode === 'nearby' ? 'Nearby stops' : 'Saved stops';
  const empty = useMemo(() => {
    if (loading) return null;
    if (error) return null;
    if (mode === 'saved' && stops.length === 0) return 'No saved stops yet. Open any stop and tap the star.';
    if (mode === 'nearby' && stops.length === 0) return 'No stops within a mile of you.';
    return null;
  }, [mode, stops.length, loading, error]);

  return (
    <section className="sheet sheet--expanded" aria-label={title}>
      <div className="sheet__handle" aria-hidden="true">
        <span />
      </div>
      <header className="sheet__header">
        <div className="sheet__title">
          <div className="segmented" role="tablist" aria-label="Stop list">
            <button type="button" role="tab" aria-selected={mode === 'nearby'} className={mode === 'nearby' ? 'is-on' : ''} onClick={() => onSwitchMode('nearby')}>
              Near me
            </button>
            <button type="button" role="tab" aria-selected={mode === 'saved'} className={mode === 'saved' ? 'is-on' : ''} onClick={() => onSwitchMode('saved')}>
              Saved{savedCount ? ` (${savedCount})` : ''}
            </button>
          </div>
        </div>
        <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="sheet__body">
        {loading && (
          <ul className="arrivals" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="arrival arrival--skeleton" />
            ))}
          </ul>
        )}
        {error && (
          <p className="sheet__empty">
            {error}
            <br />
            <button type="button" className="sheet__more" onClick={onRefresh}>
              Try again
            </button>
          </p>
        )}
        {empty && <p className="sheet__empty">{empty}</p>}

        {!loading && stops.length > 0 && (
          <ul className="stoplist">
            {stops.map((stop) => {
              const routeIds = stop.routeIds?.length ? stop.routeIds : stopRouteIds.get(String(stop.id)) || [];
              const next = nextState.data ? nextState.data[String(stop.id)] : null;
              const nextRoute = next ? routesById.get(String(next.routeId)) : null;
              const remaining = next ? next.secondsToArrival - elapsed : null;
              return (
                <li key={stop.id}>
                  <button type="button" className="stoprow" onClick={() => onSelectStop({ ...stop, routeIds })}>
                    <div className="stoprow__main">
                      <div className="stoprow__name">{stop.name}</div>
                      <div className="stoprow__meta">
                        {stop.distanceMeters != null && <span>{formatDistance(stop.distanceMeters)}</span>}
                        {routeIds.length > 0 && (
                          <span className="stoprow__routes">
                            {routeIds.map((id) => {
                              const r = routesById.get(String(id));
                              return r ? (
                                <span key={id} className="route-badge route-badge--sm" style={{ background: r.color, color: r.textColor }} title={r.name}>
                                  {r.shortLabel || r.shortName}
                                </span>
                              ) : null;
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="stoprow__next">
                      {next === undefined && <span className="stoprow__eta stoprow__eta--muted">…</span>}
                      {next === null && <span className="stoprow__eta stoprow__eta--muted">No bus</span>}
                      {next && (
                        <>
                          <span className="stoprow__eta">{formatEta(remaining)}</span>
                          <span className="stoprow__eta-route">
                            {nextRoute?.shortLabel || nextRoute?.shortName || next.routeShortName || ''}
                            {next.isScheduled ? ' · sched' : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="sheet__footer">
        <span>
          {nextState.updatedAt ? `Updated ${timeAgo(nextState.updatedAt, now)}` : stops.length ? 'Loading next buses…' : ''}
        </span>
        <button type="button" className="sheet__refresh" onClick={onRefresh} aria-label="Refresh">
          ↻
        </button>
      </footer>
    </section>
  );
}
