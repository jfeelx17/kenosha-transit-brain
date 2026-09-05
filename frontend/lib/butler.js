// The Butler: pure arithmetic, no React, no network.
//
//   leave in  =  bus arrives in  -  walk to the stop  -  buffer
//
// Given the live arrivals for a trip's stop, pick the soonest bus you can
// still catch and say what to do about it.
import { distanceMeters } from './geo';

export const WALK_SPEED_MPS = 1.3; // relaxed adult walking pace
export const DETOUR_FACTOR = 1.3; // streets are not straight lines
export const LEAVE_NOW_WINDOW_S = 60; // "leave now" means within the next minute

/** Straight-line distance with a detour factor, at the given pace. */
export function estimateWalkSeconds(from, to, speedMps = WALK_SPEED_MPS) {
  if (!from || !to) return null;
  const meters = distanceMeters(from, to) * DETOUR_FACTOR;
  return Math.round(meters / Math.max(0.3, speedMps));
}

/**
 * Decide what the rider should do right now.
 *
 * @param {object} p
 * @param {object} p.trip          { routeIds[], walkSeconds, bufferSeconds }
 * @param {Array}  p.arrivals      normalized arrivals for the trip's stop (soonest first)
 * @param {Map}    p.vehiclesById  live vehicles (for the crowd meter), may be empty
 * @param {number} p.now           epoch ms
 * @param {number} p.fetchedAt     epoch ms when `arrivals` were fetched (to count down between polls)
 * @returns {{state:string, secondsToLeave:number|null, remainingSeconds:number|null, arrival:object|null,
 *            vehicle:object|null, timetable:boolean, missed:Array, next:object|null}}
 *
 * States: 'leave-in' | 'leave-now' | 'hurry' | 'no-bus'
 *   leave-in : more than a minute until you need to go
 *   leave-now: you need to go within the next minute
 *   hurry    : you are already late for a comfortable walk, but the bus is still catchable
 *   no-bus   : nothing catchable is predicted
 */
export function adviseTrip({ trip, arrivals = [], vehiclesById = new Map(), now = Date.now(), fetchedAt = now }) {
  const walk = Number(trip?.walkSeconds) || 0;
  const buffer = Number(trip?.bufferSeconds) || 0;
  const wanted = new Set((trip?.routeIds || []).map(String));
  const elapsed = Math.max(0, (now - fetchedAt) / 1000);

  const candidates = arrivals
    .filter((a) => a && a.secondsToArrival !== null && a.secondsToArrival !== undefined)
    .filter((a) => wanted.size === 0 || wanted.has(String(a.routeId)))
    .map((a) => ({ arrival: a, remaining: a.secondsToArrival - elapsed }))
    .sort((x, y) => x.remaining - y.remaining);

  const missed = candidates.filter((c) => c.remaining - walk <= 0).map((c) => c.arrival);
  const catchable = candidates.filter((c) => c.remaining - walk > 0);

  if (!catchable.length) {
    return { state: 'no-bus', secondsToLeave: null, remainingSeconds: null, arrival: null, vehicle: null, timetable: false, missed, next: null };
  }

  const best = catchable[0];
  const secondsToLeave = best.remaining - walk - buffer;
  let state = 'leave-in';
  if (secondsToLeave <= 0) state = 'hurry';
  else if (secondsToLeave <= LEAVE_NOW_WINDOW_S) state = 'leave-now';

  const vehicle = best.arrival.vehicleId != null ? vehiclesById.get(String(best.arrival.vehicleId)) || null : null;
  return {
    state,
    secondsToLeave: Math.round(secondsToLeave),
    remainingSeconds: Math.round(best.remaining),
    arrival: best.arrival,
    vehicle,
    timetable: Boolean(best.arrival.isScheduled),
    missed,
    next: catchable[1]?.arrival || null,
  };
}

/** "Leave in 7 min" | "Leave in 45 s" for the card title. */
export function formatLeaveIn(seconds) {
  if (seconds === null || seconds === undefined) return '';
  if (seconds >= 90) return `Leave in ${Math.round(seconds / 60)} min`;
  if (seconds > 60) return 'Leave in 1 min';
  return `Leave in ${Math.max(0, Math.round(seconds))} s`;
}

/** One-line human summary used by the card and the notification body. */
export function describeAdvice(advice, routeLabel) {
  const r = routeLabel || (advice?.arrival?.routeShortName ? `Route ${advice.arrival.routeShortName}` : 'Bus');
  if (!advice || advice.state === 'no-bus') return { title: 'No bus to catch', detail: 'Nothing predicted for this trip right now.' };
  const mins = Math.max(0, Math.round(advice.remainingSeconds / 60));
  const eta = mins <= 0 ? 'arriving' : `in ${mins} min`;
  const bus = advice.vehicle ? ` · Bus ${advice.vehicle.name}` : '';
  const load = advice.vehicle && advice.vehicle.apcPercentage != null ? ` · ${advice.vehicle.apcPercentage}% full` : '';
  const source = advice.timetable ? ' · timetable' : '';
  const detail = `${r} ${eta}${bus}${load}${source}`;
  if (advice.state === 'hurry') return { title: 'Hurry, leave right now', detail };
  if (advice.state === 'leave-now') return { title: 'Leave now', detail };
  return { title: formatLeaveIn(advice.secondsToLeave), detail };
}
