// GET /api/debug/upstream?path=/Region/0/Routes
// GET /api/debug/upstream?url=https://api.syncromatics.com/portal/...   (syncromatics hosts only)
// Add &grep=<regex>&context=300&max=40 to list every match in the body with surrounding text.
// Add &full=1 to return the whole body (up to 300 KB).
// Add &ua=chrome to send the old browser string for this one request, &ua=honest to force
//   our own identifier, or &ua=<anything> to try a string of your own. Same resolution as
//   the TRANSIT_USER_AGENT variable, so this is how you check a rollback before setting it.
//
// Shows exactly what a transit endpoint answers: status, content type, server
// headers and the first part of the body, both raw and as readable text.
import { BASE_URL, HONEST_UA, USER_AGENT, isMock, probeUpstream, readableSnippet, resolveUserAgent, sendError, sendJson } from '../../../lib/transit';

const SAFE_PATH = /^\/[A-Za-z0-9_\-./%?=&]*$/;
const ALLOWED_HOSTS = /(^|\.)syncromatics\.com$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, new Error('GET only'), 405);

  let target;
  if (typeof req.query.url === 'string' && req.query.url) {
    let parsed;
    try {
      parsed = new URL(req.query.url);
    } catch {
      return sendError(res, new Error('url must be absolute'), 400);
    }
    const siteHost = new URL(BASE_URL).host;
    if (parsed.host !== siteHost && !ALLOWED_HOSTS.test(parsed.hostname)) {
      return sendError(res, new Error(`url host must be ${siteHost} or *.syncromatics.com`), 400);
    }
    target = { url: parsed.toString() };
  } else {
    const path = typeof req.query.path === 'string' ? req.query.path : '/Region/0/Routes';
    if (!SAFE_PATH.test(path) || path.includes('//')) {
      return sendError(res, new Error('path must be a same-site path like /Region/0/Routes'), 400);
    }
    target = { path };
  }

  const grep = typeof req.query.grep === 'string' && req.query.grep ? req.query.grep : null;
  const context = Math.min(2000, Math.max(20, Number(req.query.context) || 300));
  const maxMatches = Math.min(200, Math.max(1, Number(req.query.max) || 40));
  const full = req.query.full === '1' || req.query.full === 'true';

  const uaArg = typeof req.query.ua === 'string' ? req.query.ua.trim() : '';
  const userAgent = uaArg ? resolveUserAgent(uaArg) : USER_AGENT;

  try {
    const r = await probeUpstream(target.path ?? target.url, {
      raw: Boolean(grep) || /\.m?js(\?|$)/.test(target.path || target.url),
      headers: { 'User-Agent': userAgent },
    });
    let json = null;
    try {
      json = JSON.parse(r.text);
    } catch {
      json = null;
    }

    let matches;
    if (grep) {
      let re;
      try {
        re = new RegExp(grep, 'gi');
      } catch (err) {
        return sendError(res, new Error(`bad grep regex: ${err.message}`), 400);
      }
      matches = [];
      let m;
      while ((m = re.exec(r.text)) && matches.length < maxMatches) {
        const start = Math.max(0, m.index - context);
        const end = Math.min(r.text.length, m.index + m[0].length + context);
        matches.push({ at: m.index, match: m[0], snippet: r.text.slice(start, end) });
        if (m[0].length === 0) re.lastIndex++;
      }
    }

    return sendJson(res, 200, {
      baseUrl: BASE_URL,
      mockModeActive: isMock(),
      userAgent,
      userAgentIsHonest: userAgent === HONEST_UA,
      url: r.url,
      finalUrl: r.finalUrl,
      status: r.status,
      ok: r.ok,
      contentType: r.contentType,
      server: r.server,
      cfRay: r.cfRay || undefined,
      ms: r.ms,
      bytes: r.text.length,
      isJson: json !== null,
      jsonSummary:
        json === null
          ? undefined
          : Array.isArray(json)
            ? { type: 'array', length: json.length, firstKeys: json[0] && typeof json[0] === 'object' ? Object.keys(json[0]) : undefined }
            : { type: typeof json, keys: typeof json === 'object' ? Object.keys(json) : undefined },
      grep: grep || undefined,
      matchCount: matches ? matches.length : undefined,
      matches,
      textPreview: grep ? undefined : readableSnippet(r.text, 600),
      rawPreview: grep ? undefined : r.text.slice(0, 1500),
      body: full ? r.text.slice(0, 300 * 1024) : undefined,
      bodyTruncated: full ? r.text.length > 300 * 1024 : undefined,
    });
  } catch (err) {
    return sendError(res, err);
  }
}
