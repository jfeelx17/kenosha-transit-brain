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

## Next
Set with the owner after v0.1 (see the conversation record / PR #1 for candidates:
permanent free URL for daily phone use; nearby stops and favourites; service alerts;
schedule/GTFS parsing in the hub; automated build-and-test on every push).
