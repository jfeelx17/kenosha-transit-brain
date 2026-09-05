// GET /api/debug/discover
//
// Finds where kenoshatransit.com's front-end gets its data. Downloads the
// site's HTML shell and its JavaScript bundles, pulls out every URL and
// API-looking string, and probes a handful of likely endpoints. Open it in a
// browser tab and paste the JSON back when the map cannot load routes.
import { BASE_URL, probeUpstream, readableSnippet, sendError, sendJson } from '../../../lib/transit';

const MAX_ASSETS = 60;
const MAX_ASSET_BYTES = 3 * 1024 * 1024;
const TIME_BUDGET_MS = 40000;
const CONCURRENCY = 4;

const NOISE = /w3\.org|reactjs\.org|react\.dev|github\.com|fonts\.g|googletagmanager|google-analytics|schema\.org|mozilla\.org|npmjs|jsdelivr|unpkg|sentry\.io|localhost|example\.com|apple\.com|openstreetmap|maptiler|mapbox|carto|w3c|creativecommons|json-schema|purl\.org|xmlns|typescriptlang|nodejs\.org|unicode\.org|iana\.org|whatwg|khronos|opengl|microsoft\.com|chromium|webkit|adobe|googleapis\.com\/css/i;
const INTERESTING = /api|vehicle|arrival|prediction|predict|stop|route|region|realtime|real-time|gtfs|graphql|socket|signalr|hub|track|syncromatics|gmv|agency|customer|trip|eta|alert|json|endpoint|baseurl|base_url|host/i;

const PROBES = [
  '/Region/0/Routes',
  '/Regions',
  '/Route/1/Vehicles',
  '/Stop/1/Arrivals',
  '/api/routes',
  '/api/Routes',
  '/api/v1/routes',
  '/api/Region/0/Routes',
  '/api/Route/1/Vehicles',
  '/api/Stop/1/Arrivals',
  '/routes',
  '/routes.json',
  '/api/vehicles',
  '/api/config',
  '/api/environment',
  '/env',
  '/config.json',
  '/robots.txt',
];

function unique(list) {
  return [...new Set(list)];
}

function extractAssets(html) {
  const out = [];
  const re = /(?:href|src)=["']([^"']+\.m?js(?:\?[^"']*)?)["']/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return unique(out);
}

function extractFromText(text, into) {
  let m;
  const urlRe = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{4,200}/g;
  while ((m = urlRe.exec(text))) into.urls.add(m[0].replace(/[),;'"`\\]+$/, ''));

  const wsRe = /wss?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{4,200}/g;
  while ((m = wsRe.exec(text))) into.urls.add(m[0]);

  // Quoted strings and template fragments that look like API paths or config.
  const strRe = /["'`]((?:\/|\.\/)?[A-Za-z0-9_./${}:-]{3,140})["'`]/g;
  while ((m = strRe.exec(text))) {
    const s = m[1];
    if (INTERESTING.test(s) && /[\/${]/.test(s)) into.paths.add(s);
  }

  // key: "value" config pairs mentioning api/base urls
  const cfgRe = /([A-Za-z_]*(?:api|API|Api|base|BASE|Base|host|HOST|url|URL|Url|endpoint|ENDPOINT)[A-Za-z_]*)\s*[:=]\s*["'`]([^"'`]{3,200})["'`]/g;
  while ((m = cfgRe.exec(text))) into.config.add(`${m[1]} = ${m[2]}`);

  const viteRe = /import\.meta\.env\.([A-Z0-9_]+)|process\.env\.([A-Z0-9_]+)|window\.ENV\.([A-Za-z0-9_]+)|ENV\.([A-Z][A-Z0-9_]+)/g;
  while ((m = viteRe.exec(text))) into.envKeys.add(m[1] || m[2] || m[3] || m[4]);
}

function extractInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) if (m[1].trim()) out.push(m[1]);
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx], idx);
      }
    })
  );
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);
  const started = Date.now();
  const found = { urls: new Set(), paths: new Set(), config: new Set(), envKeys: new Set() };
  const report = { baseUrl: BASE_URL, shell: null, assets: [], inlineScripts: 0, probes: [], notes: [] };

  try {
    const shell = await probeUpstream('/', { raw: true });
    report.shell = { status: shell.status, contentType: shell.contentType, textPreview: readableSnippet(shell.text, 200) };
    const inline = extractInlineScripts(shell.text);
    report.inlineScripts = inline.length;
    for (const s of inline) extractFromText(s, found);
    extractFromText(shell.text, found);

    const queue = extractAssets(shell.text).filter((u) => u.startsWith('/') || u.startsWith(BASE_URL));
    const seen = new Set();
    const fetched = [];

    while (queue.length && fetched.length < MAX_ASSETS && Date.now() - started < TIME_BUDGET_MS) {
      const batch = queue.splice(0, CONCURRENCY * 2).filter((u) => !seen.has(u));
      batch.forEach((u) => seen.add(u));
      const results = await mapLimit(batch, CONCURRENCY, async (asset) => {
        const path = asset.startsWith(BASE_URL) ? asset.slice(BASE_URL.length) : asset;
        try {
          const r = await probeUpstream(path, { raw: true });
          const text = r.text.slice(0, MAX_ASSET_BYTES);
          extractFromText(text, found);
          // Vite chunks import siblings; follow one level.
          const importRe = /["'](\.\/|\/assets\/)([A-Za-z0-9_.-]+\.m?js)["']/g;
          let m;
          while ((m = importRe.exec(text))) {
            const next = `/assets/${m[2]}`;
            if (!seen.has(next) && !queue.includes(next)) queue.push(next);
          }
          return { path, status: r.status, bytes: r.text.length, contentType: r.contentType.split(';')[0] };
        } catch (err) {
          return { path, error: err.message };
        }
      });
      fetched.push(...results);
    }
    report.assets = fetched;
    if (queue.length) report.notes.push(`${queue.length} more asset(s) not scanned (limit reached)`);

    const probeResults = await mapLimit(PROBES, CONCURRENCY, async (path) => {
      try {
        const r = await probeUpstream(path);
        let isJson = false;
        try {
          JSON.parse(r.text);
          isJson = true;
        } catch {
          isJson = false;
        }
        return { path, status: r.status, contentType: r.contentType.split(';')[0], isJson, preview: readableSnippet(r.text, isJson ? 200 : 80) };
      } catch (err) {
        return { path, error: err.message };
      }
    });
    report.probes = probeResults;
  } catch (err) {
    return sendError(res, err);
  }

  const siteHost = new URL(BASE_URL).host;
  const urls = [...found.urls];
  const likelyApi = urls.filter((u) => !NOISE.test(u) && (!u.includes(siteHost) || INTERESTING.test(u)));
  const other = urls.filter((u) => !likelyApi.includes(u) && !NOISE.test(u));

  return sendJson(res, 200, {
    ...report,
    elapsedMs: Date.now() - started,
    likelyApiUrls: likelyApi.sort(),
    configHints: [...found.config].sort().slice(0, 200),
    envKeys: [...found.envKeys].sort(),
    apiLookingPaths: [...found.paths].sort().slice(0, 400),
    otherUrls: other.sort().slice(0, 100),
  });
}
