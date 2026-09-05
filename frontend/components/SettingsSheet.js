import { useEffect, useRef, useState } from 'react';
import { downloadBackup, importJson } from '../lib/backup';
import { count as logCount, clear as clearLog } from '../lib/predictionLog';
import { permissionState, requestPermission } from '../lib/notify';

const PACES = [
  { value: 1.1, label: 'Relaxed' },
  { value: 1.3, label: 'Normal' },
  { value: 1.6, label: 'Brisk' },
];

/** Minimal settings: walk pace, trips, alerts, backup, evidence log. */
export default function SettingsSheet({ trips, onRemoveTrip, settings, onSaveSettings, onImported, onClose }) {
  const [rows, setRows] = useState(0);
  const [perm, setPerm] = useState('default');
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    setRows(logCount());
    setPerm(permissionState());
  }, []);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const restored = importJson(data);
      setMessage(`Restored: ${Object.entries(restored).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      setRows(logCount());
      onImported?.();
    } catch (err) {
      setMessage(`Import failed: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <section className="sheet sheet--expanded settings" aria-label="Settings">
      <header className="sheet__header">
        <div className="sheet__title">
          <h2>Settings</h2>
          <div className="sheet__stopid">Everything here stays on this device.</div>
        </div>
        <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="sheet__body">
        <h3>Walking pace</h3>
        <div className="segmented">
          {PACES.map((p) => (
            <button
              key={p.value}
              type="button"
              className={Math.abs((settings.walkSpeedMps ?? 1.3) - p.value) < 0.01 ? 'is-on' : ''}
              onClick={() => onSaveSettings({ ...settings, walkSpeedMps: p.value })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="settings__hint">Used to estimate the walk to a stop when you create a trip.</p>

        <h3>Trips</h3>
        {trips.length === 0 ? (
          <p className="settings__hint">No trips yet. Open a stop and tap 🚶 Trip.</p>
        ) : (
          <ul className="settings__list">
            {trips.map((t) => (
              <li key={t.id}>
                <span>
                  <strong>{t.stopName}</strong>
                  <br />
                  <small>
                    Routes {t.routeIds.length ? t.routeIds.join(', ') : 'any'} · walk {Math.round(t.walkSeconds / 60)} min · buffer{' '}
                    {Math.round(t.bufferSeconds / 60)} min
                  </small>
                </span>
                <button type="button" className="btn btn--danger btn--sm" onClick={() => onRemoveTrip(t.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3>Alerts</h3>
        <p className="settings__hint">
          {perm === 'granted' && 'Notifications are on. The Butler will vibrate and notify you when it is time to leave.'}
          {perm === 'default' && 'Not enabled yet.'}
          {perm === 'denied' && 'Blocked in the browser. Allow notifications for this site in the browser or system settings.'}
          {perm === 'unsupported' && 'This browser cannot show notifications. On iPhone, install the app to the home screen first.'}
        </p>
        {perm === 'default' && (
          <button type="button" className="btn btn--primary" onClick={async () => setPerm(await requestPermission())}>
            Enable alerts
          </button>
        )}

        <h3>Backup</h3>
        <div className="settings__actions">
          <button type="button" className="btn btn--primary" onClick={downloadBackup}>
            Export JSON
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={onFile} />
        </div>
        {message && <p className="settings__hint">{message}</p>}

        <h3>Evidence log</h3>
        <p className="settings__hint">
          {rows.toLocaleString()} prediction rows recorded for your trip stops. Included in the export; this is the raw material for
          on-time statistics later.
        </p>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            clearLog();
            setRows(0);
          }}
        >
          Clear log
        </button>

        <h3>Private link</h3>
        <p className="settings__hint">
          This app is unlocked per device with your access key. To lock everyone out, change <code>APP_ACCESS_KEY</code> in Vercel and
          redeploy.
        </p>
      </div>
    </section>
  );
}
