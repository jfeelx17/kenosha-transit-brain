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

const DAY_MS = 86400000;

/** "Today only" / "Until Tue 8 Sep" / "Ends today" — when a service notice actually bites. */
export function alertWindow(alert, now = Date.now()) {
  const end = alert?.endsAt ? Date.parse(alert.endsAt) : NaN;
  if (!Number.isFinite(end)) return 'Ongoing';
  const days = Math.ceil((end - now) / DAY_MS);
  if (days <= 0) return 'Ending now';
  if (days === 1) return 'Today only';
  const d = new Date(end);
  const label = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  // The vendor ends a notice at 23:59:59 on the last affected day, so "until" reads better
  // than naming a date the notice no longer applies on.
  return days <= 14 ? `Until ${label}` : 'Ongoing';
}

/** "4 Sep - 8 Sep" for the detail view. */
export function alertDates(alert) {
  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
  const from = fmt(alert?.startsAt);
  const to = fmt(alert?.endsAt);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to || '';
}
