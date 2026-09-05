// Export / import of everything personal this app keeps on the device.
// Losing the phone must not mean losing the product (Loop Doctrine: own your software).
import { TRIPS_KEY } from './trips';
import { LOG_KEY, LAST_SEEN_KEY } from './predictionLog';

export const FAVORITES_KEY = 'kenosha-loop:favorites:v1';
export const SETTINGS_KEY = 'kenosha-loop:settings:v1';
const KEYS = { favorites: FAVORITES_KEY, trips: TRIPS_KEY, settings: SETTINGS_KEY, predictionLog: LOG_KEY, predictionLastSeen: LAST_SEEN_KEY };

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings() {
  return { walkSpeedMps: 1.3, ...read(SETTINGS_KEY, {}) };
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function exportJson() {
  return {
    app: 'kenosha-loop',
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: read(KEYS.favorites, []),
    trips: read(KEYS.trips, []),
    settings: read(KEYS.settings, {}),
    predictionLog: read(KEYS.predictionLog, []),
    predictionLastSeen: read(KEYS.predictionLastSeen, {}),
  };
}

/** Replaces on-device data with the backup. Returns a summary of what was restored. */
export function importJson(data) {
  if (!data || data.app !== 'kenosha-loop') throw new Error('Not a Kenosha Loop backup');
  const restored = {};
  for (const [name, key] of Object.entries(KEYS)) {
    if (name in data) {
      window.localStorage.setItem(key, JSON.stringify(data[name]));
      restored[name] = Array.isArray(data[name]) ? data[name].length : 'ok';
    }
  }
  return restored;
}

/** Hands the backup to the browser as a download (works from an installed PWA). */
export function downloadBackup() {
  const json = JSON.stringify(exportJson(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kenosha-loop-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
