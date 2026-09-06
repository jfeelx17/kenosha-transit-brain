// Decode a real kenoshatransit.com page payload and check that we still read it correctly.
//
//   node scripts/check-transit.mjs
//
// The fixture in lib/fixtures/transit-hydration.json is the genuine turbo-stream array captured
// from the live site on 2026-09-05 (the MapTiler key redacted). It is the only thing standing
// between us and the vendor quietly changing their page: if this fails, the map and the alerts
// are about to fail too, and /api/debug/discover is the next stop.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { APP_VERSION } from '../lib/version.js';
import { alertIsActive, alertsForRoute, alertsForStop, isSystemWide, normalizeAlert, sortAlerts } from '../lib/alerts.js';
import { alertsFromHydration, decodeTurboStream, normalizeRoute, routesFromHydration } from '../lib/transit.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, '..', 'lib', 'fixtures', 'transit-hydration.json'), 'utf8');

// The app sees this payload inside a <script> tag, so wrap it the way the page does.
const html = `<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(JSON.parse(raw)))});</script>`;

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

// The day the fixture was captured: the Labor Day notice is in force, the car show one has just expired.
const NOW = Date.parse('2026-09-06T12:00:00Z');

const decoded = decodeTurboStream(JSON.parse(raw));
check('turbo-stream decodes with resolved key names', Boolean(decoded?.loaderData?.['routes/transit']), Object.keys(decoded?.loaderData || {}).join(','));

const routes = routesFromHydration(html).map(normalizeRoute);
check('17 routes read from the page', routes.length === 17, String(routes.length));
check('route 1 keeps its id, name and colour', routes.some((r) => String(r.id) === '6037' && r.shortName === '1' && r.color === '#F6901E'));

const all = alertsFromHydration(html).map(normalizeAlert);
check('8 service alerts found', all.length === 8, String(all.length));

const active = sortAlerts(all.filter((a) => alertIsActive(a, NOW)));
check('7 of them in force on 2026-09-06', active.length === 7, String(active.length));
check('the car show notice has expired by then', !active.some((a) => a.title.includes('Lakeside Towers')));

const urgent = active.filter((a) => a.urgent);
check('exactly one urgent notice that day', urgent.length === 1, urgent.map((a) => a.title).join(' | '));
check('and it is Labor Day, sorted first', active[0]?.title === 'No Bus service on Labor day', active[0]?.title);

const labor = active[0];
check('Labor Day covers all 7 public routes', labor.routeIds.length === 7, labor.routeIds.join(','));
check('Labor Day is not silently treated as system-wide', !isSystemWide(labor));
check('Labor Day text survives with its line breaks', labor.text.includes('\n') && /resume on Tuesday Sept 8/.test(labor.text));
check('Labor Day ends Tue 8 Sep', labor.endsAt?.startsWith('2026-09-08'), labor.endsAt);

const standing = active.filter((a) => !a.urgent);
check('6 standing notices, kept out of the banner', standing.length === 6, String(standing.length));
check('the fare notice is standing, not urgent', standing.some((a) => a.title.startsWith('Transfer Usage')));

// Assignment matching, the thing the stop sheet and the Butler rely on.
const saxony = all.find((a) => a.id === 65959);
check('stop assignments carry rtpi numbers', saxony?.stopRtpiNumbers.includes('536'), saxony?.stopRtpiNumbers.join(','));
check(
  'a Saxony Manor stop matches its notice',
  alertsForStop(active, { id: 9239730, rtpiNumber: '536', routeIds: [] }).some((a) => a.id === 65959)
);
check(
  'a bus stop is told about Labor Day',
  alertsForStop(active, { id: 1, rtpiNumber: '999', routeIds: ['6038'] }).some((a) => a.id === 73007)
);
// The notice says the streetcar keeps running, and route 6075 is not in its assignment.
check(
  'a streetcar stop is NOT told there is no service',
  alertsForStop(active, { id: 2, rtpiNumber: '998', routeIds: ['6075'] }).every((a) => a.id !== 73007)
);
check('route 5 has its own notices', alertsForRoute(active, 6041).length >= 3, String(alertsForRoute(active, 6041).length));

const pkgVersion = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version;
check('lib/version.js matches package.json', APP_VERSION === pkgVersion, `${APP_VERSION} vs ${pkgVersion}`);

check('no live API key in the fixture', !raw.includes('maptilerApiKey":"') || raw.includes('REDACTED-NOT-A-REAL-KEY'));

console.log(failed ? `\n${failed} check(s) failed` : '\nall transit payload checks passed');
process.exit(failed ? 1 : 0);
