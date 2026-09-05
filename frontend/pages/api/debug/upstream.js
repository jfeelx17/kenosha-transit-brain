// GET /api/debug/upstream?path=/Region/0/Routes
//
// Shows exactly what kenoshatransit.com answers for a path: status, content
// type, server headers and the first part of the body, both raw and as
// readable text. Open it in a browser tab when the map shows an API error.
import { BASE_URL, isMock, probeUpstream, readableSnippet, sendError, sendJson } from '../../../lib/transit';

const SAFE_PATH = /^\/[A-Za-z0-9_\-./%?=&]*$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);
  const path = typeof req.query.path === 'string' ? req.query.path : '/Region/0/Routes';
  if (!SAFE_PATH.test(path) || path.includes('//')) {
    return sendError(res, new Error('path must be a same-site path like /Region/0/Routes'), 400);
  }
  try {
    const r = await probeUpstream(path);
    let json = null;
    try {
      json = JSON.parse(r.text);
    } catch {
      json = null;
    }
    return sendJson(res, 200, {
      baseUrl: BASE_URL,
      mockModeActive: isMock(),
      url: r.url,
      finalUrl: r.finalUrl,
      status: r.status,
      ok: r.ok,
      contentType: r.contentType,
      server: r.server,
      cfRay: r.cfRay || undefined,
      ms: r.ms,
      isJson: json !== null,
      jsonSummary:
        json === null
          ? undefined
          : Array.isArray(json)
            ? { type: 'array', length: json.length, firstKeys: json[0] && typeof json[0] === 'object' ? Object.keys(json[0]) : undefined }
            : { type: typeof json, keys: typeof json === 'object' ? Object.keys(json) : undefined },
      textPreview: readableSnippet(r.text, 600),
      rawPreview: r.text.slice(0, 1500),
    });
  } catch (err) {
    return sendError(res, err);
  }
}
