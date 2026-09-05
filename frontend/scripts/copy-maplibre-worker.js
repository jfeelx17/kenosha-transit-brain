// MapLibre GL 6 runs its tile/GeoJSON processing in a *module* web worker that
// imports "maplibre-gl-worker.mjs" (which imports "./maplibre-gl-shared.mjs").
// Bundlers such as Turbopack do not emit those files as separately served
// assets, so the worker never starts and no GeoJSON layer ever renders.
//
// This script copies both files into public/maplibre/ so the browser can load
// them from a stable URL; components/MapView.js points MapLibre at that URL via
// setWorkerUrl(). It runs automatically via the postinstall/predev/prebuild
// hooks in package.json.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'maplibre-gl', 'dist');
const dest = path.join(__dirname, '..', 'public', 'maplibre');
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

fs.mkdirSync(dest, { recursive: true });
for (const file of files) {
  const from = path.join(src, file);
  if (!fs.existsSync(from)) {
    console.error(`copy-maplibre-worker: ${from} not found. Run npm install first.`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(dest, file));
}
console.log(`copy-maplibre-worker: copied ${files.join(', ')} -> public/maplibre/`);
