# Kenosha Loop (frontend)

Private, single-user PWA: a dark MapLibre map of Kenosha Transit with live buses,
a **Next Bus** bottom sheet (minutes away per route) and a **Crowd Meter**
(passenger load from each bus's APCPercentage).

```bash
npm install
npm run dev          # http://localhost:3000, live data
npm run dev:mock     # fake buses, works offline
npm run build && npm start
```

Full setup, phone access and troubleshooting: [../docs/RUN_LOCAL.md](../docs/RUN_LOCAL.md).

## Layout

```
pages/index.js                 loads the map client-side
pages/api/routes.js            GET /Region/0/Routes  -> routes + stops (cached 5 min)
pages/api/vehicles/[routeId]   GET /Route/{id}/Vehicles -> positions, heading, apcPercentage
pages/api/arrivals/[stopId]    GET /Stop/{id}/Arrivals  -> secondsToArrival, sorted
pages/api/trace/[routeId]      GET /Resources/Traces/*.kml -> GeoJSON line (best effort)
lib/transit.js                 upstream fetch (Chrome UA), normalizers, mock switch
lib/mock.js                    fake data used when KENOSHA_MOCK=1
components/MapView.js          map, stops layer, vehicle markers, route chips
components/NextBusSheet.js     the bottom sheet: polls arrivals, joins vehicle load
components/CrowdMeter.js       bar + label from a 0-100 load percentage
public/manifest.webmanifest    PWA manifest; public/sw.js caches only the shell
scripts/copy-maplibre-worker.js copies MapLibre's worker into public/maplibre (runs on install/dev/build)
```
