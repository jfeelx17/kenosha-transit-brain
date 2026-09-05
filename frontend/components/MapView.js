import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, Popup, GeolocateControl, LngLatBounds, setWorkerUrl } from 'maplibre-gl';
import { fetchJson } from '../lib/client';
import { usePolling } from '../hooks/usePolling';
import { useNow } from '../hooks/useNow';
import { INLINE_STYLE, resolveMapStyle } from '../lib/mapStyle';
import { crowdLevel, timeAgo } from '../lib/format';
import RouteChips from './RouteChips';
import NextBusSheet from './NextBusSheet';

const KENOSHA = { center: [-87.8212, 42.5847], zoom: 12.3 };
const POLL_VEHICLES_MS = Number(process.env.NEXT_PUBLIC_POLL_VEHICLES_MS) || 10000;
const POLL_ROUTES_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };
const ARROW_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L20 20 L12 16 L4 20 Z" fill="currentColor" stroke="#0b1020" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export default function MapView() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // vehicleId -> { marker, el, arrow, label, vehicle, route }
  const popupRef = useRef(null);
  const tracesRef = useRef(new Map()); // routeId -> Promise<feature|null>
  const fittedRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [basemapFallback, setBasemapFallback] = useState(false);
  const [hiddenRouteIds, setHiddenRouteIds] = useState(() => new Set());
  const [selectedStop, setSelectedStop] = useState(null);
  const now = useNow(1000);

  // ---- routes (stops come bundled) -----------------------------------------
  const routesState = usePolling('routes', () => fetchJson('/api/routes'), POLL_ROUTES_MS, { keepPrevious: true });
  const routes = routesState.data?.routes ?? [];
  const isMock = Boolean(routesState.data?.mock);
  const routesById = useMemo(() => new Map(routes.map((r) => [String(r.id), r])), [routes]);
  const visibleRoutes = useMemo(
    () => routes.filter((r) => !hiddenRouteIds.has(String(r.id))),
    [routes, hiddenRouteIds]
  );
  const visibleKey = visibleRoutes.map((r) => String(r.id)).join(',');

  // ---- live vehicles for every visible route --------------------------------
  const vehiclesState = usePolling(
    `vehicles:${visibleKey}`,
    async () => {
      const ids = visibleKey ? visibleKey.split(',') : [];
      const results = await Promise.allSettled(ids.map((id) => fetchJson(`/api/vehicles/${encodeURIComponent(id)}`)));
      const vehicles = [];
      const failures = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') vehicles.push(...(r.value.vehicles || []));
        else failures.push(`route ${ids[i]}: ${r.reason?.message || r.reason}`);
      });
      if (ids.length && failures.length === ids.length) throw new Error(failures[0]);
      return { vehicles, failures };
    },
    POLL_VEHICLES_MS,
    { enabled: Boolean(visibleKey), keepPrevious: true }
  );
  const vehicles = vehiclesState.data?.vehicles ?? [];
  const vehiclesById = useMemo(() => new Map(vehicles.map((v) => [String(v.id), v])), [vehicles]);

  const stopsGeoJson = useMemo(() => buildStopsGeoJson(visibleRoutes), [visibleRoutes]);

  // ---- map bootstrap --------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    // MapLibre 6 loads its worker as an ES module; serve it from /public so the
    // bundler cannot break the import (see scripts/copy-maplibre-worker.js).
    setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

    const map = new MapLibreMap({
      container: containerRef.current,
      style: resolveMapStyle(process.env.NEXT_PUBLIC_MAP_STYLE),
      center: KENOSHA.center,
      zoom: KENOSHA.zoom,
      maxZoom: 19,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Handy for poking at the map from the browser console (and for e2e tests).
    window.__kenoshaLoopMap = map;

    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'top-right'
    );

    // If the basemap style cannot be fetched (offline, blocked host), fall back
    // to a plain dark background so stops and buses still render.
    let loaded = false;
    let fellBack = false;
    const fallBack = () => {
      if (loaded || fellBack) return;
      fellBack = true;
      setBasemapFallback(true);
      map.setStyle(INLINE_STYLE);
    };
    const fallbackTimer = setTimeout(fallBack, 8000);
    map.on('error', (e) => {
      // Tile errors carry sourceId/tile; a style-level failure does not.
      if (!loaded && !e?.sourceId && !e?.tile) fallBack();
    });
    map.once('load', () => {
      loaded = true;
      clearTimeout(fallbackTimer);
      addLayers(map);
      setMapReady(true);
    });

    return () => {
      clearTimeout(fallbackTimer);
      markersRef.current.forEach((entry) => entry.marker.remove());
      markersRef.current.clear();
      map.remove();
      delete window.__kenoshaLoopMap;
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ---- click handling -------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    const onClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['stops-hit'] });
      if (features.length) {
        const p = features[0].properties;
        setSelectedStop({
          id: String(p.id),
          name: p.name,
          lat: Number(p.lat),
          lng: Number(p.lng),
          routeIds: safeParseArray(p.routeIds),
        });
      } else {
        setSelectedStop(null);
      }
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', onClick);
    map.on('mouseenter', 'stops-hit', onEnter);
    map.on('mouseleave', 'stops-hit', onLeave);
    return () => {
      map.off('click', onClick);
      map.off('mouseenter', 'stops-hit', onEnter);
      map.off('mouseleave', 'stops-hit', onLeave);
    };
  }, [mapReady]);

  // ---- stops layer data + first fit -----------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.getSource('stops')?.setData(stopsGeoJson);
    if (!fittedRef.current && stopsGeoJson.features.length) {
      const bounds = new LngLatBounds();
      stopsGeoJson.features.forEach((f) => bounds.extend(f.geometry.coordinates));
      map.fitBounds(bounds, { padding: { top: 130, bottom: 60, left: 30, right: 30 }, maxZoom: 14, duration: 0 });
      fittedRef.current = true;
    }
  }, [mapReady, stopsGeoJson]);

  // ---- selected stop highlight ----------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setFilter('stops-selected', ['==', ['get', 'id'], selectedStop ? String(selectedStop.id) : '']);
  }, [mapReady, selectedStop]);

  // ---- route polylines (best effort, cached per route) ----------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;
    let cancelled = false;
    (async () => {
      const features = await Promise.all(
        visibleRoutes.map((r) => {
          const key = String(r.id);
          if (!tracesRef.current.has(key)) {
            tracesRef.current.set(
              key,
              fetchJson(`/api/trace/${encodeURIComponent(r.id)}`)
                .then((d) => d.feature || null)
                .catch(() => null)
            );
          }
          return tracesRef.current.get(key);
        })
      );
      if (cancelled) return;
      map.getSource('traces')?.setData({ type: 'FeatureCollection', features: features.filter(Boolean) });
    })();
    return () => {
      cancelled = true;
    };
  }, [mapReady, visibleRoutes]);

  // ---- vehicle markers ------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const seen = new Set();
    for (const v of vehicles) {
      const key = String(v.id);
      seen.add(key);
      const route = routesById.get(String(v.routeId));
      let entry = markersRef.current.get(key);
      if (!entry) {
        entry = createVehicleMarker(map, popupRef);
        markersRef.current.set(key, entry);
      }
      updateVehicleMarker(entry, v, route);
    }
    for (const [key, entry] of markersRef.current) {
      if (!seen.has(key)) {
        entry.marker.remove();
        markersRef.current.delete(key);
      }
    }
  }, [mapReady, vehicles, routesById]);

  // ---- UI ---------------------------------------------------------------------
  const status = vehiclesState.error ? 'error' : vehiclesState.updatedAt ? 'live' : 'connecting';
  let statusText = 'Connecting…';
  if (routesState.error && !routes.length) statusText = 'Offline';
  else if (vehiclesState.error) statusText = 'Bus feed error';
  else if (vehiclesState.updatedAt) statusText = `${vehicles.length} bus${vehicles.length === 1 ? '' : 'es'} · ${timeAgo(vehiclesState.updatedAt, now)}`;

  const toggleRoute = (id) =>
    setHiddenRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={`app ${selectedStop ? 'app--sheet-open' : ''}`}>
      <div ref={containerRef} className="map" />

      <header className="topbar">
        <div className="brand">
          <span className="brand__dot" data-state={status} />
          Kenosha Loop
        </div>
        <div className="status" title={vehiclesState.error?.message || ''}>
          {isMock && <span className="badge badge--mock">MOCK</span>}
          <span>{statusText}</span>
        </div>
      </header>

      <RouteChips routes={routes} hidden={hiddenRouteIds} onToggle={toggleRoute} onShowAll={() => setHiddenRouteIds(new Set())} />

      {routesState.error && !routes.length && (
        <div className="banner banner--error" role="alert">
          <span>Couldn't load routes: {routesState.error.message}</span>
          <button type="button" onClick={routesState.refresh}>Retry</button>
        </div>
      )}
      {basemapFallback && (
        <div className="banner">
          <span>Basemap unavailable — showing a plain background. Stops and buses still work.</span>
          <button type="button" onClick={() => setBasemapFallback(false)}>OK</button>
        </div>
      )}

      {selectedStop && (
        <NextBusSheet stop={selectedStop} routesById={routesById} vehiclesById={vehiclesById} onClose={() => setSelectedStop(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (module level so they are not recreated on every render)
// ---------------------------------------------------------------------------

function addLayers(map) {
  if (!map.getSource('traces')) map.addSource('traces', { type: 'geojson', data: EMPTY_FC });
  if (!map.getSource('stops')) map.addSource('stops', { type: 'geojson', data: EMPTY_FC });

  map.addLayer({
    id: 'traces',
    type: 'line',
    source: 'traces',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 4, 17, 7],
      'line-opacity': 0.75,
    },
  });
  // Invisible, generous hit area so stops are easy to tap on a phone.
  map.addLayer({
    id: 'stops-hit',
    type: 'circle',
    source: 'stops',
    paint: { 'circle-radius': 16, 'circle-opacity': 0, 'circle-stroke-width': 0 },
  });
  map.addLayer({
    id: 'stops',
    type: 'circle',
    source: 'stops',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 14, 5, 17, 9],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#0b1020',
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: 'stops-selected',
    type: 'circle',
    source: 'stops',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 7, 14, 10, 17, 15],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 3,
    },
  });
}

/** Dedupe stops shared by several routes and emit a GeoJSON FeatureCollection. */
function buildStopsGeoJson(routes) {
  const byId = new Map();
  for (const r of routes) {
    for (const s of r.stops || []) {
      const key = String(s.id);
      const existing = byId.get(key);
      if (existing) {
        if (!existing.routeIds.includes(String(r.id))) existing.routeIds.push(String(r.id));
      } else {
        byId.set(key, { id: key, name: s.name, lat: s.lat, lng: s.lng, color: r.color, routeIds: [String(r.id)] });
      }
    }
  }
  return {
    type: 'FeatureCollection',
    features: [...byId.values()].map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { id: s.id, name: s.name, lat: s.lat, lng: s.lng, color: s.color, routeIds: JSON.stringify(s.routeIds) },
    })),
  };
}

function safeParseArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createVehicleMarker(map, popupRef) {
  const el = document.createElement('div');
  el.className = 'vehicle';
  const arrow = document.createElement('div');
  arrow.className = 'vehicle__arrow';
  arrow.innerHTML = ARROW_SVG; // static markup, no upstream data
  const label = document.createElement('div');
  label.className = 'vehicle__label';
  el.append(arrow, label);

  const entry = { marker: null, el, arrow, label, vehicle: null, route: null };
  el.addEventListener('click', (e) => {
    e.stopPropagation(); // keep the map's click handler from closing the sheet
    showVehiclePopup(map, popupRef, entry);
  });
  entry.marker = new Marker({ element: el, anchor: 'center' }).setLngLat([0, 0]).addTo(map);
  return entry;
}

function updateVehicleMarker(entry, vehicle, route) {
  entry.vehicle = vehicle;
  entry.route = route;
  entry.marker.setLngLat([vehicle.lng, vehicle.lat]);
  entry.el.style.setProperty('--vehicle', route?.color || '#38bdf8');
  entry.el.classList.toggle('vehicle--noheading', vehicle.heading === null);
  entry.arrow.style.transform = vehicle.heading === null ? '' : `rotate(${vehicle.heading}deg)`;
  entry.label.textContent = route?.shortName ?? String(vehicle.routeId ?? '');
  const level = crowdLevel(vehicle.apcPercentage);
  entry.el.title = `${route?.name || `Route ${vehicle.routeId}`} · Bus ${vehicle.name}${
    level.key === 'unknown' ? '' : ` · ${level.label} (${Math.round(vehicle.apcPercentage)}%)`
  }`;
}

/** Popup built with DOM APIs so upstream strings are never parsed as HTML. */
function showVehiclePopup(map, popupRef, entry) {
  const { vehicle: v, route } = entry;
  if (!v) return;
  const root = document.createElement('div');
  root.className = 'vpopup';

  const title = document.createElement('strong');
  title.textContent = route?.name || `Route ${v.routeId}`;
  const line1 = document.createElement('div');
  line1.textContent = `Bus ${v.name}${v.destination ? ` → ${v.destination}` : ''}`;
  const level = crowdLevel(v.apcPercentage);
  const line2 = document.createElement('div');
  line2.className = `vpopup__crowd vpopup__crowd--${level.key}`;
  line2.textContent = level.key === 'unknown' ? 'No load data' : `${level.label} · ${Math.round(v.apcPercentage)}% full`;
  const line3 = document.createElement('small');
  line3.textContent = v.lastUpdated
    ? `GPS ${new Date(v.lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
    : '';
  root.append(title, line1, line2, line3);

  if (!popupRef.current) {
    popupRef.current = new Popup({ offset: 18, closeButton: false, className: 'vehicle-popup' });
  }
  popupRef.current.setLngLat([v.lng, v.lat]).setDOMContent(root).addTo(map);
}
