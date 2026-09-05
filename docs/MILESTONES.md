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

## v0.2 — Loop in your pocket (in progress)

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

## Later (candidates)
- Service alerts from the feed (Labor Day, stop relocations) inside the app.
- Schedule/GTFS parsing in the data hub so the app can show timetable times when no bus is
  tracked, and answer questions like "last Route 2 tonight".
- Automated build-and-test on every push, plus a scheduled upstream-shape check that alerts
  when kenoshatransit.com changes.
