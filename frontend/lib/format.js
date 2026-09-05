// Small, dependency-free formatting helpers shared by the map and the sheet.

/** Seconds until arrival -> "Due" | "7 min" | "—". */
export function formatEta(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds <= 60) return 'Due';
  return `${Math.round(seconds / 60)} min`;
}

/** ISO timestamp -> "3:42 PM" in the viewer's locale. */
export function formatClock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Epoch ms -> "just now" | "12s ago" | "3 min ago". */
export function timeAgo(timestamp, now = Date.now()) {
  const s = Math.max(0, Math.round((now - timestamp) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)} min ago`;
}

/**
 * Passenger load (APCPercentage, 0-100) -> crowd level.
 * Thresholds are deliberately simple: a rider only needs "can I sit down?".
 */
export function crowdLevel(percentage) {
  if (percentage === null || percentage === undefined || !Number.isFinite(percentage)) {
    return { key: 'unknown', label: 'No load data' };
  }
  if (percentage <= 40) return { key: 'low', label: 'Plenty of room' };
  if (percentage <= 75) return { key: 'mid', label: 'Filling up' };
  return { key: 'high', label: 'Crowded' };
}

/** Metres -> "350 ft" | "0.4 mi" (US units; Kenosha riders think in miles). */
export function formatDistance(meters) {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '';
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`;
  return `${(feet / 5280).toFixed(1)} mi`;
}
