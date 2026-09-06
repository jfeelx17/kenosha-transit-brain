import { useState } from 'react';
import { alertDates, alertWindow } from '../lib/format';

function AlertItem({ alert, routesById }) {
  const badges = alert.routeIds.map((id) => routesById.get(String(id))).filter(Boolean);
  return (
    <li className={`notice ${alert.urgent ? 'notice--urgent' : ''}`}>
      <div className="notice__head">
        <h3>{alert.title}</h3>
        <span className="notice__when">{alert.urgent ? alertWindow(alert) : alertDates(alert)}</span>
      </div>
      {alert.text && <p className="notice__text">{alert.text}</p>}
      {(badges.length > 0 || alert.stopNames.length > 0) && (
        <div className="notice__scope">
          {badges.map((r) => (
            <span key={r.id} className="route-badge route-badge--sm" style={{ background: r.color, color: r.textColor }} title={r.name}>
              {r.shortLabel || r.shortName}
            </span>
          ))}
          {alert.stopNames.length > 0 && <span className="notice__stops">{alert.stopNames.join(' · ')}</span>}
        </div>
      )}
    </li>
  );
}

/** Every notice in force, urgent first, standing ones folded away. */
export default function AlertsSheet({ alerts = [], routesById, onClose }) {
  const urgent = alerts.filter((a) => a.urgent);
  const standing = alerts.filter((a) => !a.urgent);
  const [showStanding, setShowStanding] = useState(urgent.length === 0);

  return (
    <section className="sheet sheet--expanded settings" aria-label="Service notices">
      <header className="sheet__header">
        <div className="sheet__title">
          <h2>Service notices</h2>
          <div className="sheet__stopid">Posted by Kenosha Transit</div>
        </div>
        <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="sheet__body">
        {alerts.length === 0 && <p className="sheet__empty">No service notices right now.</p>}

        {urgent.length > 0 && (
          <>
            <h3 className="notice__group">Affects your day</h3>
            <ul className="notices">
              {urgent.map((a) => (
                <AlertItem key={a.id} alert={a} routesById={routesById} />
              ))}
            </ul>
          </>
        )}

        {standing.length > 0 && (
          <>
            <button type="button" className="notice__toggle" onClick={() => setShowStanding((v) => !v)} aria-expanded={showStanding}>
              {showStanding ? '▾' : '▸'} Standing notices ({standing.length})
            </button>
            {showStanding && (
              <ul className="notices">
                {standing.map((a) => (
                  <AlertItem key={a.id} alert={a} routesById={routesById} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
