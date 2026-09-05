// GET /api/debug/discover
//
// Finds where kenoshatransit.com's front-end gets its data. Downloads the
// site's HTML shell and its JavaScript bundles, pulls out every URL and
// API-looking string, quotes the code around the URL-building spots, and
// probes likely endpoints on the site and on api.syncromatics.com.
// Open it in a browser tab and paste the JSON back when the map cannot load.
import { BASE_URL, probeUpstream, readableSnippet, routesFromHydration, rtpiPath, sendError, sendJson, unwrapList } from '../../../lib/transit';

const MAX_ASSETS = 60;
const MAX_ASSET_BYTES = 3 * 1024 * 1024;
const TIME_BUDGET_MS = 40000;
const CONCURRENCY = 4;
const PORTAL_ID = process.env.TRANSIT_PORTAL_ID || '170';
const PORTAL_API = process.env.TRANSIT_PORTAL_API || 'https://api.syncromatics.com/portal';

const NOISE = /w3\.org|reactjs\.org|react\.dev|reactrouter\.com|github\.com|fonts\.g|googletagmanager|google-analytics|google\.com\/maps|schema\.org|mozilla\.org|npmjs|jsdelivr|unpkg|sentry\.io|localhost|example\.com|apple\.com|openstreetmap|maptiler|maplibre|mapbox|carto|w3c|creativecommons|json-schema|purl\.org|xmlns|typescriptlang|nodejs\.org|unicode\.org|iana\.org|whatwg|khronos|opengl|microsoft\.com|chromium|webkit|adobe|googleapis\.com\/css/i;
const INTERESTING = /api|vehicle|arrival|prediction|predict|stop|route|region|realtime|real-time|gtfs|graphql|socket|signalr|hub|track|syncromatics|gmv|agency|customer|portal|trip|eta|alert|json|endpoint|baseurl|base_url|host/i;

// Code excerpts worth reading: how the app builds its API URLs.
const SNIPPET_PATTERNS = [
  { name: 'apiBaseUrl', re: /apiBaseUrl/g, max: 8 },
  { name: 'vehicles-url', re: /\/vehicles`/g, max: 4 },
  { name: 'arrivals-url', re: /\/arrivals`/g, max: 4 },
  { name: 'routes-list', re: /["'`]routes["'`]|`routes`|\/routes["'`]/g, max: 6 },
  { name: 'ip-json', re: /ip\.json/g, max: 3 },
  { name: 'customer-or-portal-id', re: /customerId|customer_id|portalId|portal_id|agencyId|tenantId|x-customer|x-portal|x-api-key|apiKey|api_key/gi, max: 10 },
  { name: 'fetch-with-base', re: /fetch\(`\$\{[a-zA-Z_.]+\}\//g, max: 6 },
];

const SITE_PROBES = ['/Region/0/Routes', '/Route/1/Vehicles', '/Stop/1/Arrivals', '/api/routes', '/robots.txt'];

const PORTAL_PROBES = [
  `${PORTAL_API}/${PORTAL_ID}/routes`,
  `${PORTAL_API}/customers/${PORTAL_ID}/routes`,
  `${PORTAL_API}/customer/${PORTAL_ID}/routes`,
  `${PORTAL_API}/portals/${PORTAL_ID}/routes`,
  `${PORTAL_API}/agencies/${PORTAL_ID}/routes`,
  `${PORTAL_API}/routes?customerId=${PORTAL_ID}`,
  `${PORTAL_API}/routes?customer=${PORTAL_ID}`,
  `${PORTAL_API}/routes?portalId=${PORTAL_ID}`,
  `${PORTAL_API}/routes`,
  `${PORTAL_API}/geolocation/ip.json`,
  `${PORTAL_API}/${PORTAL_ID}/geolocation/ip.json`,
  `${PORTAL_API}/customers?host=${new URL(BASE_URL).host}`,
  `${PORTAL_API}/customers/${new URL(BASE_URL).host}`,
  `${PORTAL_API}/${PORTAL_ID}`,
  `${PORTAL_API}/customers/${PORTAL_ID}`,
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

  const strRe = /["'`]((?:\/|\.\/)?[A-Za-z0-9_./${}:?=&-]{3,140})["'`]/g;
  while ((m = strRe.exec(text))) {
    const s = m[1];
    if (INTERESTING.test(s) && /[/${?]/.test(s)) into.paths.add(s);
  }

  const cfgRe = /([A-Za-z_]*(?:api|API|Api|base|BASE|Base|host|HOST|url|URL|Url|endpoint|ENDPOINT|customer|Customer|portal|Portal)[A-Za-z_]*)\s*[:=]\s*["'`]([^"'`]{1,200})["'`]/g;
  while ((m = cfgRe.exec(text))) into.config.add(`${m[1]} = ${m[2]}`);

  const numCfgRe = /((?:customer|portal|agency|tenant)[A-Za-z_]*)\s*[:=]\s*(\d{1,6})\b/gi;
  while ((m = numCfgRe.exec(text))) into.config.add(`${m[1]} = ${m[2]}`);

  const viteRe = /import\.meta\.env\.([A-Z0-9_]+)|process\.env\.([A-Z0-9_]+)|window\.ENV\.([A-Za-z0-9_]+)|ENV\.([A-Z][A-Z0-9_]+)/g;
  while ((m = viteRe.exec(text))) into.envKeys.add(m[1] || m[2] || m[3] || m[4]);
}

function collectSnippets(source, text, into, context = 220) {
  for (const p of SNIPPET_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags);
    let m;
    let n = 0;
    while ((m = re.exec(text)) && n < p.max) {
      const start = Math.max(0, m.index - context);
      const end = Math.min(text.length, m.index + m[0].length + context);
      into.push({ source, pattern: p.name, at: m.index, code: text.slice(start, end) });
      n++;
      if (m[0].length === 0) re.lastIndex++;
    }
  }
}

/**
 * React Router (turbo-stream) hydration: window.__reactRouterContext.streamController.enqueue("...").
 * The argument is a JS string literal whose escapes are JSON-compatible, so JSON.parse recovers it.
 * Returns the decoded payload (capped) plus any key/token-looking pairs and route names it contains.
 */
function decodeHydration(inlineScripts) {
  const chunks = [];
  const re = /streamController\.enqueue\((".*?")\);?/gs;
  for (const script of inlineScripts) {
    let m;
    while ((m = re.exec(script))) {
      try {
        chunks.push(JSON.parse(m[1]));
      } catch {
        chunks.push(m[1]);
      }
    }
  }
  const text = chunks.join('\n');
  const secrets = [];
  const secretRe = /"([A-Za-z_]*(?:[Kk]ey|[Tt]oken|[Ss]ecret|[Aa]pi[A-Za-z_]*|[Cc]ustomer[A-Za-z_]*|[Pp]ortal[A-Za-z_]*))",\s*("[^"]{1,200}"|-?\d+)/g;
  let m;
  while ((m = secretRe.exec(text)) && secrets.length < 60) secrets.push(`${m[1]} -> ${m[2]}`);
  const labels = [];
  const labelRe = /"(name|shortName|longName|label|title|id|routeId|color|displayName)",\s*("[^"]{1,80}"|-?\d+)/g;
  while ((m = labelRe.exec(text)) && labels.length < 120) labels.push(`${m[1]}=${m[2]}`);
  return {
    chunks: chunks.length,
    bytes: text.length,
    keyLikePairs: secrets,
    labelPairs: labels,
    decodedPreview: text.slice(0, 12000),
  };
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

async function probe(target, headers) {
  try {
    const r = await probeUpstream(target, { headers });
    let json = null;
    try {
      json = JSON.parse(r.text);
    } catch {
      json = null;
    }
    const summary =
      json === null
        ? undefined
        : Array.isArray(json)
          ? { type: 'array', length: json.length, firstKeys: json[0] && typeof json[0] === 'object' ? Object.keys(json[0]).slice(0, 25) : undefined }
          : { type: typeof json, keys: typeof json === 'object' && json ? Object.keys(json).slice(0, 25) : undefined };
    return {
      target,
      status: r.status,
      contentType: r.contentType.split(';')[0],
      isJson: json !== null,
      jsonSummary: summary,
      preview: json !== null ? r.text.slice(0, 1200) : readableSnippet(r.text, 120),
    };
  } catch (err) {
    return { target, error: err.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);
  const started = Date.now();
  const found = { urls: new Set(), paths: new Set(), config: new Set(), envKeys: new Set() };
  const snippets = [];
  const smallModules = {};
  const report = { baseUrl: BASE_URL, portalApi: PORTAL_API, portalId: PORTAL_ID, shell: null, assets: [], inlineScripts: 0, notes: [] };

  try {
    const shell = await probeUpstream('/', { raw: true });
    report.shell = { status: shell.status, contentType: shell.contentType, textPreview: readableSnippet(shell.text, 200) };
    const inline = extractInlineScripts(shell.text);
    report.inlineScripts = inline.length;
    report.inlineScriptPreviews = inline.map((s) => s.replace(/\s+/g, ' ').slice(0, 400));
    for (const s of inline) extractFromText(s, found);
    extractFromText(shell.text, found);
    collectSnippets('/', shell.text, snippets);
    report.hydration = decodeHydration(inline);

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
          collectSnippets(path, text, snippets);
          if (text.length <= 16 * 1024 && /Context|Service|Store|Endpoint|api|config|env|Load|Vehicle|Arrival|Stop|Route/i.test(path)) {
            smallModules[path] = text;
          }
          const importRe = /["'](\.\/|\/assets\/)([A-Za-z0-9_.-]+\.m?js)["']/g;
          let m;
          while ((m = importRe.exec(text))) {
            const next = `/assets/${m[2]}`;
            if (!seen.has(next) && !queue.includes(next)) queue.push(next);
          }
          return { path, status: r.status, bytes: r.text.length };
        } catch (err) {
          return { path, error: err.message };
        }
      });
      fetched.push(...results);
    }
    report.assets = fetched;
    if (queue.length) report.notes.push(`${queue.length} more asset(s) not scanned (limit reached)`);

    const siteHeaders = { Origin: BASE_URL, Referer: `${BASE_URL}/` };
    report.siteProbes = await mapLimit(SITE_PROBES, CONCURRENCY, (p) => probe(p));
    report.portalProbes = await mapLimit(PORTAL_PROBES, CONCURRENCY, (u) => probe(u, siteHeaders));

    // Routes embedded in the page, then real samples through the site's own /api/rtpi proxy.
    const hydrationRoutes = routesFromHydration(shell.text);
    report.hydrationRoutes = { count: hydrationRoutes.length, sample: hydrationRoutes.slice(0, 3) };
    const firstRouteId = hydrationRoutes[0]?.id ?? PORTAL_ID;
    const rtpiSamples = {};
    const sample = async (name, portalPath) => {
      rtpiSamples[name] = await probe(rtpiPath(portalPath));
      return rtpiSamples[name];
    };
    await sample('routes', 'routes');
    await sample('vehicles', `routes/${firstRouteId}/vehicles`);
    const stops = await sample('stops', `routes/${firstRouteId}/stops`);
    await sample('patterns', `routes/${firstRouteId}/patterns`);
    let firstStopId = null;
    try {
      const list = unwrapList(JSON.parse((await probeUpstream(rtpiPath(`routes/${firstRouteId}/stops`))).text));
      firstStopId = list[0]?.id ?? list[0]?.stop?.id ?? null;
    } catch {
      firstStopId = null;
    }
    if (firstStopId != null) {
      await sample('arrivals', `stops/${firstStopId}/arrivals`);
      await sample('stopRoutes', `stops/${firstStopId}/routes`);
    } else {
      rtpiSamples.arrivals = { skipped: 'no stop id found in stops sample', stopsStatus: stops?.status };
    }
    await sample('nearby', `stops/search?lat=42.5847&lon=-87.8212&distance=1500`);
    report.rtpiSamples = rtpiSamples;
  } catch (err) {
    return sendError(res, err);
  }

  const siteHost = new URL(BASE_URL).host;
  const urls = [...found.urls];
  const likelyApi = urls.filter((u) => !NOISE.test(u) && (!u.includes(siteHost) || INTERESTING.test(u)));

  return sendJson(res, 200, {
    ...report,
    elapsedMs: Date.now() - started,
    workingPortalProbes: (report.portalProbes || []).filter((p) => p.isJson).map((p) => p.target),
    likelyApiUrls: likelyApi.sort(),
    configHints: [...found.config].filter((c) => !/^base = |^textBaseline|maptiler|rtlPlugin|telemetry|terrain/i.test(c)).sort().slice(0, 200),
    envKeys: [...found.envKeys].sort(),
    codeSnippets: snippets.slice(0, 60),
    smallModules,
    apiLookingPaths: [...found.paths].filter((p) => !/^\.\/|^\/assets\//.test(p)).sort().slice(0, 400),
  });
}
