import { useMemo, useState } from 'react';
import { estimateWalkSeconds } from '../lib/butler';
import { makeTrip } from '../lib/trips';

/**
 * Inline editor shown inside the Next Bus sheet: which routes count, how long
 * the walk to this stop takes, and how much buffer you want.
 */
export default function TripEditor({ stop, routes, userPos, existing, walkSpeedMps = 1.3, onSave, onDelete, onCancel }) {
  const estimate = useMemo(
    () => (userPos && stop ? estimateWalkSeconds(userPos, { lat: stop.lat, lng: stop.lng }, walkSpeedMps) : null),
    [userPos, stop, walkSpeedMps]
  );
  const [routeIds, setRouteIds] = useState(() => new Set(existing?.routeIds?.length ? existing.routeIds : routes.map((r) => String(r.id))));
  const [walkMin, setWalkMin] = useState(() =>
    existing ? Math.max(1, Math.round(existing.walkSeconds / 60)) : estimate ? Math.max(1, Math.round(estimate / 60)) : 5
  );
  const [bufferMin, setBufferMin] = useState(() => (existing ? Math.round(existing.bufferSeconds / 60) : 1));

  const toggleRoute = (id) =>
    setRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    onSave(
      makeTrip({
        stop,
        routeIds: [...routeIds],
        walkSeconds: Number(walkMin) * 60,
        bufferSeconds: Number(bufferMin) * 60,
        name: existing?.name,
      })
    );
  };

  return (
    <form
      className="trip-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3>{existing ? 'Edit trip' : 'Make this a trip'}</h3>
      <p className="trip-editor__hint">The Butler will tell you when to leave for this stop.</p>

      <label className="trip-editor__label">Routes that count</label>
      <div className="trip-editor__routes">
        {routes.map((r) => {
          const on = routeIds.has(String(r.id));
          return (
            <button
              key={r.id}
              type="button"
              className={`chip ${on ? 'chip--on' : ''}`}
              style={{ '--chip': r.color }}
              aria-pressed={on}
              onClick={() => toggleRoute(String(r.id))}
              title={r.name}
            >
              {r.shortLabel || r.shortName}
            </button>
          );
        })}
      </div>

      <div className="trip-editor__row">
        <label>
          Walk to the stop
          <span className="trip-editor__unit">
            <input type="number" min="1" max="60" value={walkMin} onChange={(e) => setWalkMin(e.target.value)} /> min
          </span>
        </label>
        <label>
          Buffer
          <span className="trip-editor__unit">
            <input type="number" min="0" max="15" value={bufferMin} onChange={(e) => setBufferMin(e.target.value)} /> min
          </span>
        </label>
      </div>
      {estimate !== null && (
        <p className="trip-editor__hint">About {Math.max(1, Math.round(estimate / 60))} min from where you are now.</p>
      )}

      <div className="trip-editor__actions">
        <button type="submit" className="btn btn--primary" disabled={routeIds.size === 0}>
          Save trip
        </button>
        {existing && (
          <button type="button" className="btn btn--danger" onClick={() => onDelete(existing.id)}>
            Delete
          </button>
        )}
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
