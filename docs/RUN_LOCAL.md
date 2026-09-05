# Run Kenosha Loop locally (about $0)

Two processes on one machine, no cloud, no accounts:

| Piece | Tech | URL |
|---|---|---|
| **Kenosha Loop** map app (PWA) | Next.js 16 + MapLibre GL | http://localhost:3000 |
| **Data hub** (uploads, knowledge base) | Flask | http://localhost:5000 |

The Next.js server also proxies the Kenosha Transit real-time API for the browser
(`/api/vehicles/[routeId]`, `/api/arrivals/[stopId]`, `/api/routes`, `/api/trace/[routeId]`),
adding a normal Chrome User-Agent so the upstream site answers.

## 0. One-time setup

### Chromebook (Linux terminal / Crostini)

```bash
sudo apt update && sudo apt install -y python3 python3-venv git curl
```

Debian's packaged Node is too old for Next.js 16 (needs Node 20.9+). Install Node 22 with nvm:
follow the two-line installer at https://github.com/nvm-sh/nvm#installing-and-updating, then

```bash
nvm install 22
node -v      # v22.x
```

### Mac

```bash
brew install node python
```

### Get the code and dependencies

```bash
git clone <your-repo-url> kenosha-transit-brain
cd kenosha-transit-brain
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
(cd frontend && npm install)
```

`scripts/dev.sh` does the venv and `npm install` steps itself on first run, so you can skip them.

## 1. Run everything with one command

```bash
./scripts/dev.sh            # live Kenosha Transit data, hot reload
./scripts/dev.sh --mock     # built-in fake buses: works offline or after service hours
./scripts/dev.sh --prod     # production build + start (fastest; use this day to day)
```

Open http://localhost:3000 for the map and http://localhost:5000 for uploads. `Ctrl+C` stops both.

## 2. Or run each piece by hand (two terminals)

```bash
# Terminal 1 - data hub
.venv/bin/python scripts/upload_server.py

# Terminal 2 - map app
cd frontend
npm run dev                  # development
npm run build && npm start   # production
KENOSHA_MOCK=1 npm run dev   # fake data
```

## 3. Install it as an app

Run with `--prod`, open http://localhost:3000 in Chrome, then menu -> **Install Kenosha Loop**.
Chrome only offers install on secure origins; `localhost` counts. Dev mode does not register
the service worker on purpose, so install from a production build.

## 4. Use it from your phone

- **Same Wi-Fi:** both servers bind to `0.0.0.0`, so `http://<computer-ip>:3000` works
  (`hostname -I` prints the IP). On a Chromebook, also allow the ports: Settings -> Linux
  development environment -> Port forwarding -> add 3000 and 5000. Plain-HTTP over Wi-Fi works
  as a website but Chrome will not offer "Install" (no HTTPS).
- **Anywhere, still free:** put the map app on Vercel's free plan with the built-in access key.
  See [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md). That is the intended daily-use setup.

## 4b. The Butler: get told when to leave

Open any stop, tap **🚶** in the sheet header, check the routes that count, set how long your
walk is and how much buffer you want, then **Save trip**. Close the sheet and a card sits above
the dock: *Leave in 7 min · Route 2 in 10 min · Bus 4072 · 37% full*, counting down every
second. Tap the card to open that stop; tap **🔔 Alerts** once to let it vibrate and notify you
when it is time to go.

Notifications need a secure origin, so they work on `localhost` and on the HTTPS deployment,
but not over plain HTTP on your Wi-Fi IP. On iPhone they only work after you add the app to the
home screen, and the permission prompt must come from a tap, which is why the bell is a button.

Trips, saved stops, your walking pace and the prediction log live in that browser only. Nothing
personal reaches the server. **⚙ → Export JSON** writes the lot to a file; Import restores it on
a new phone.

## 5. Configuration

Frontend: copy `frontend/.env.example` to `frontend/.env.local` and edit. Highlights:

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAP_STYLE` | `openfreemap-dark` | `carto-dark`, `osm-dark`, `inline`, or any style URL |
| `NEXT_PUBLIC_POLL_VEHICLES_MS` | `15000` | how often bus positions refresh |
| `NEXT_PUBLIC_POLL_ARRIVALS_MS` | `15000` | how often the Next Bus sheet refreshes |
| `KENOSHA_MOCK` | empty | `1` serves fake data |
| `TRANSIT_BASE_URL` | `https://www.kenoshatransit.com` | upstream API |
| `TRANSIT_CUSTOMER_ID` | empty | only if `/Stop/{id}/Arrivals` needs `?customerId=` |
| `TRANSIT_USER_AGENT` | a Chrome string | what we tell the upstream we are; see below |

`NEXT_PUBLIC_*` values are baked in at build time: rebuild after changing them.

### Telling the upstream who we are

The proxy calls send a Chrome User-Agent because the site rejects requests that look automated.
That is worth revisiting rather than keeping forever. Try an honest identifier on one request,
no redeploy needed:

```
/api/debug/upstream?path=/api/rtpi?path=routes%2F6037%2Fvehicles&ua=honest
```

If `isJson` comes back `true`, set `TRANSIT_USER_AGENT=KenoshaLoop/0.3 (personal)` and stop
pretending. Any other value of `ua=` is sent verbatim, so you can test your own.

Flask: `MAX_UPLOAD_MB` (100), `PORT` (5000), `HOST` (0.0.0.0), `FLASK_DEBUG` (off).
Example: `MAX_UPLOAD_MB=300 ./scripts/dev.sh`.

## 6. What it costs

Nothing recurring. Everything runs on your own machine. Map tiles come from OpenFreeMap (free,
no key) or CARTO / openstreetmap.org (free with the attribution the map already shows). The
transit data comes from the same public endpoints the official kenoshatransit.com site uses.
Polling defaults (15 s, one user) match what that site's own page does.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Banner: "Couldn't load routes: ... 403" | Upstream blocked the request. Retry; meanwhile `./scripts/dev.sh --mock`. Check with the curl below. |
| Banner mentions `text/html instead of JSON` | The site changed its proxy path or page format. Open `/api/debug/discover` and send the output along; `TRANSIT_RTPI_PATH` and `TRANSIT_API_STYLE` in `.env.local` can override the defaults. |
| Banner: "Couldn't load routes: ..." (any reason) | Open `http://localhost:3000/api/debug/upstream?path=/Region/0/Routes` in a tab. It shows the exact status, content type and body the site sent. Try `?path=/Regions` and `?path=/Route/1/Vehicles` too. |
| Map shows stops but no route lines | Normal if the site has no KML traces. Lines are best effort. |
| Buses appear but no stops or lines at all | MapLibre's worker files are missing. Run `cd frontend && node scripts/copy-maplibre-worker.js` (normally automatic on install/dev/build). |
| Plain dark background, no streets | Basemap host unreachable. Set `NEXT_PUBLIC_MAP_STYLE=carto-dark` or `osm-dark` in `.env.local`, rebuild. |
| Upload page: "Server answered HTTP 413" | `MAX_UPLOAD_MB=300 ./scripts/dev.sh` |
| Upload page: "Server answered HTTP 500 ...", message shown | That message is the real Python error; the JSON fix makes it visible instead of hiding it. |
| `Address already in use` | `FLASK_PORT=5001 ./scripts/dev.sh`; for Next edit the `-p 3000` in `frontend/package.json`. |
| Chromebook: localhost:3000 does not open | Settings -> Linux -> Port forwarding -> add 3000 and 5000. |

### Check the real API from the terminal

kenoshatransit.com is a server-rendered app whose browser code fetches live data through a
same-origin proxy, `/api/rtpi?path=<portal path>`. The route list is embedded in the page.

```bash
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
# live buses on Route 1 (id 6037)
curl -sA "$UA" -H 'Accept: application/json' 'https://www.kenoshatransit.com/api/rtpi?path=routes%2F6037%2Fvehicles' | head -c 800; echo
# stops on Route 1
curl -sA "$UA" -H 'Accept: application/json' 'https://www.kenoshatransit.com/api/rtpi?path=routes%2F6037%2Fstops' | head -c 800; echo
# predictions at a stop (take an id from the stops call)
curl -sA "$UA" -H 'Accept: application/json' 'https://www.kenoshatransit.com/api/rtpi?path=stops%2F<StopID>%2Farrivals' | head -c 800; echo
```

Inside the app the same checks are one click: `/api/debug/discover` (everything at once) and
`/api/debug/upstream?path=/api/rtpi?path=routes%2F6037%2Fvehicles` (one call, full body with `&full=1`).

Route ids as of September 2026: 1 = 6037, 2 = 6038, 3 = 6039, 4 = 6040, 5 = 6041, 31 = 6042,
35 = 6043, Amazon Express = 6044, Streetcar = 6075, Lakefront Trolley = 6108, school trippers 6223-6233.
