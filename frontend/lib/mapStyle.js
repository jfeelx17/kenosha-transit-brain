// Basemap selection. All options are free and need no API key.
// Controlled by NEXT_PUBLIC_MAP_STYLE (see .env.example).

export const INLINE_STYLE = {
  version: 8,
  name: 'kenosha-loop-plain',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0b1020' } }],
};

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function rasterStyle(tiles, attribution, paint = {}) {
  return {
    version: 8,
    sources: {
      basemap: { type: 'raster', tiles, tileSize: 256, attribution, maxzoom: 19 },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#0b1020' } },
      { id: 'basemap', type: 'raster', source: 'basemap', paint },
    ],
  };
}

export function resolveMapStyle(value) {
  const v = (value || 'openfreemap-dark').trim();
  switch (v) {
    case 'inline':
    case 'none':
      return INLINE_STYLE;
    case 'openfreemap-dark':
      // Vector dark style built from OpenStreetMap data, hosted by OpenFreeMap.
      return 'https://tiles.openfreemap.org/styles/dark';
    case 'carto-dark':
      return rasterStyle(
        ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`),
        `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`
      );
    case 'osm-dark':
      // Plain openstreetmap.org tiles, dimmed and desaturated so the dark UI still reads.
      return rasterStyle(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], OSM_ATTRIBUTION, {
        'raster-brightness-max': 0.45,
        'raster-saturation': -0.7,
        'raster-contrast': 0.15,
      });
    default:
      return v; // any full style URL
  }
}
