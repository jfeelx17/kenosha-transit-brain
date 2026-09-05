// Access gate for a private deployment (Next.js 16 "proxy", the former middleware).
//
// Unset APP_ACCESS_KEY -> no gate (local development is unchanged).
// Set it on the host (e.g. Vercel) and open the app once as
//   https://your-app.vercel.app/?key=THE_KEY
// The key is stored in an httpOnly cookie for a year; every later visit,
// API call and the installed PWA just work. Anyone without the key gets 401.
import { NextResponse } from 'next/server';

const COOKIE = 'kl_access';
const PUBLIC_PATHS = [/^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\//, /^\/maplibre\//, /^\/favicon/];

const LOCKED_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kenosha Loop</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#e8edff;font:16px system-ui,sans-serif}
main{max-width:22rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#8d99bb;margin:0}</style>
<main><h1>Kenosha Loop is private</h1><p>Open the link that includes your access key once on this device to unlock it.</p></main>`;

function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function proxy(request) {
  const key = process.env.APP_ACCESS_KEY;
  if (!key) return NextResponse.next();

  const { pathname, searchParams } = request.nextUrl;
  if (PUBLIC_PATHS.some((re) => re.test(pathname))) return NextResponse.next();

  if (sameKey(request.cookies.get(COOKIE)?.value, key)) return NextResponse.next();

  const supplied = searchParams.get('key');
  if (sameKey(supplied, key)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete('key');
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, key, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: 'This Kenosha Loop is private. Open the app once with ?key=YOUR_KEY to unlock this device.', status: 401 },
      { status: 401 }
    );
  }
  return new NextResponse(LOCKED_PAGE, { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
