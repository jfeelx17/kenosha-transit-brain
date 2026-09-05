# Milestones

## v0.1 — Kenosha Loop MVP (closed 2026-09-05)

**Strategic goal:** a private, one-user progressive web app that shows Kenosha Transit
buses live on a dark map, with a "Next Bus" sheet (minutes away plus a crowd meter), on
top of a working data hub for schedule PDFs, route maps and GTFS. Cost: $0.

**Status: met.** Verified end to end in GitHub Codespaces against the live Kenosha Transit
network on 2026-09-05: 17 real routes, real stops and route shapes, live buses with
passenger load, real arrival predictions.

### Delivered
- Data hub (Flask) answers JSON for every request, including errors; the upload page shows
  the real reason when something fails.
- Kenosha Loop (`frontend/`): Next.js 16 + MapLibre 6 map, stops, route shapes, live bus
  markers with derived heading, route chips (school trippers grouped, off by default),
  Next Bus bottom sheet (countdown, clock time, direction, crowd meter, "scheduled" tag),
  vehicle popup, PWA install, mock mode for offline work.
- Live data through the same proxy the official site uses
  (`kenoshatransit.com/api/rtpi?path=...`); route list from the site's page data.
- `scripts/dev.sh` runs both servers; `docs/RUN_LOCAL.md` covers Chromebook, Mac,
  Codespaces and phones; `/api/debug/discover` and `/api/debug/upstream` diagnose the
  upstream when it changes.

### How we know it works
- Flask error paths exercised with curl and the test client.
- Production build plus Playwright runs: mock mode (full UI flow) and a fake portal site
  (school grouping, scheduled rows). Hydration decoder checked against the live page payload.
- Live run in Codespaces with screenshots (see `docs/screenshots/`).

### Known limits and risks
- The upstream is unofficial. GMV can change the proxy or field names without notice; the
  discover endpoint is the first thing to run when the map shows a banner.
- The crowd meter shows whatever the feed reports (an evening bus reported 0%). Heading is
  derived from movement, so a bus that has not moved since the app opened is a dot.
- Codespaces stops when idle and uses free hours while open. Daily use wants the Chromebook
  (Node 22 required; public Wi-Fi blocked the installs) or a free always-on host.
- The data hub copies PDFs and GTFS into `data/` but does not parse them yet
  (`scripts/process_uploads.py` TODOs).
- The vehicle popup is the only place per-bus load appears; the sheet shows it per arrival.

### Route ids (September 2026)
1 = 6037, 2 = 6038, 3 = 6039, 4 = 6040, 5 = 6041, 31 = 6042, 35 = 6043,
Amazon Express = 6044, Streetcar = 6075, Lakefront Trolley = 6108, school trippers 6223–6233.

## v0.2 — Loop in your pocket (closed 2026-09-05)

**Strategic goal:** Kenosha Loop usable every day from a phone, at $0, without a laptop
running: a permanent private URL, and the two things a rider actually does at a bus stop
(find the nearest stops, check the stops they always use).

### Scope
- Private deployment: access-key gate (`frontend/proxy.js`) so a Vercel Hobby URL is
  effectively private; `docs/DEPLOY_VERCEL.md` with the Git-integration and CLI paths.
- **Near me**: locate the rider, list the nearest stops with distance and the next bus at each,
  tap through to the Next Bus sheet.
- **Saved stops**: star a stop; a Saved list with live next-bus times; kept per device.
- Route chips, bus markers and the Next Bus sheet from v0.1 unchanged.

### Done when
- The owner opens the app from the phone's home screen on a non-home network and sees live
  buses, nearby stops and saved stops within a few seconds.

### Closed
- Deployed on Vercel Hobby from `main` (project `kenosha-loop1`), access key set, gate verified
  (locked page without the key, unlocked after one visit with it).
- Verified on the owner's phone over cellular: live buses, real routes, Near me and Saved dock.
- Follow-up carried into v0.3: the vehicle record's timestamp and load fields need confirming
  against a raw sample (the popup showed a GPS time that did not change between polls).

## v0.3 — Trust the screen (closed 2026-09-05)

**Strategic goal:** everything the app shows is either live and current, or clearly labelled
as not. A rider should never wait for a bus that is actually parked.

**Status: met for the map.** Verified against a raw vehicle record pasted from the live feed.

### Delivered
- Vehicle record decoded correctly: `lastUpdated` is an ISO time, `heading` is a compass
  letter with the degrees in `headingDegrees`, `passengerLoad` is a head count next to
  `capacity` (not a percentage).
- Buses with a fix older than 10 minutes are hidden, older than 2 minutes are dimmed; the
  popup shows "as of" / "last seen" with the date and the age. A parked bus can no longer
  masquerade as a bus that is coming.

### Not built, moved to the betting table
- Service alerts from the feed (Labor Day no-service, stop relocations, detours).
- Timetable fallback in the Next Bus sheet when a stop has no live prediction.

## v0.4 — The Butler (in progress)

Shaped as "v0.3" in the planning session; renumbered here because the stale-vehicle work
above had already taken v0.3. Same bet, same appetite.

**Strategic goal:** stop telling the rider when the bus comes. Tell them **when to leave.**

**Problem.** Every morning the owner opens the map, does the arithmetic in their head
(bus minus walk minus buffer) and either leaves early or runs for it. The app already knows
every number in that sum.

**Appetite:** one week, small batch. Fixed time, variable scope.

### Scope
- **Trips.** In the Next Bus sheet, 🚶 turns a stop into a trip: which routes count, how long
  the walk is (auto-estimated from your location at your chosen pace, editable), how much
  buffer you want. Stored on the device only.
- **The Butler card.** Above the dock whenever a trip is set: *Leave in 7 min · Route 2 in
  10 min · Bus 4072 · 37% full*, counting down every second between polls. States: leave-in,
  leave-now, hurry, no bus. Tap it to open that stop.
- **Alerts.** One tap on 🔔 asks for notification permission; after that the phone vibrates
  and shows a notification once per bus when it is time to go. Tapping the notification opens
  the app.
- **Evidence log.** Every arrivals poll for a trip stop appends a compact row on the device
  (capped at 5,000). When a bus that was within 45 seconds disappears, an "arrived" row is
  written. This is the raw material for on-time statistics, and the thing an agency would
  actually want.
- **Settings.** Walking pace, your trips, alert state, Export / Import JSON, evidence-log
  count and clear, key-rotation note.
- **Politeness.** Vehicle polling relaxed from 10 s to 15 s, matching the official site.
  `TRANSIT_USER_AGENT` makes the upstream identity configurable, and
  `/api/debug/upstream?ua=honest` tests an honest identifier without a redeploy.

### Done when
The owner leaves the house on the card's say-so, catches the bus, and waits no longer than
the buffer. Record the mornings below.

### Hill chart
| Piece | State |
|---|---|
| Trips store, advice arithmetic | Done, unit tested |
| Trip editor in the sheet | Done |
| Butler card + countdown | Done |
| Alerts (vibrate, notify, SW click) | Done, verified in a headless browser |
| Evidence log, export / import, settings | Done |
| Honest User-Agent experiment | Endpoint ready; needs one run against the live site |
| Real mornings | Not started — needs the owner |

### How we know it works (sandbox)
- `butler.js` unit checks: leave-time arithmetic, countdown between polls, rolling over to the
  next bus after one becomes uncatchable, hurry, timetable flagging, no-bus, walk estimate.
- Playwright in mock mode, 27 checks: the card's leave-time matches an independent read of the
  arrivals feed minus walk minus buffer; the countdown moves without a reload; the trip
  survives a reload; the alert fires exactly once and names the stop; the same bus does not
  alert twice across a remount; the export contains the trip and the log; deleting the trip
  stands the Butler down.
- The v0.1 and v0.2 suites still pass unchanged.

### Real mornings
| Date | Trip | Card said | What happened |
|---|---|---|---|
| _(to fill in)_ | | | |

## Later (candidates)
See `docs/DOCTRINE.md` for the betting table. In short: background push while the phone is in
your pocket, the trust-layer analysis on the evidence log, service alerts and timetable
fallback, GTFS parsing in the data hub, and "Loop for any city".
