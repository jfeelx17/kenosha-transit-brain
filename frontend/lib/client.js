// Browser-side fetch helper for our own /api routes.
// Resolves to parsed JSON or throws an Error carrying the server's message.
export async function fetchJson(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
  } catch (err) {
    throw new Error(`Network error calling ${url}: ${err.message}`);
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status} from ${url}`);
  if (data === null) throw new Error(`Non-JSON response from ${url}`);
  return data;
}
