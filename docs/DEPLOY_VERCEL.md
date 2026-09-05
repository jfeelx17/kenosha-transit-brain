# Put Kenosha Loop on your phone (Vercel, $0)

The map app is a plain Next.js project, so Vercel's free Hobby plan (personal, non-commercial
use) can host it with a permanent HTTPS address. The Flask data hub stays on your own machine;
it is a development tool and is not needed by the map.

You get: `https://<your-project>.vercel.app`, installable as an app on Android and iPhone,
auto-updated every time you push to `main`.

## 1. Make it private

Anyone who knows the URL could otherwise open it. The app has a built-in gate: set an
`APP_ACCESS_KEY` and the first visit must include `?key=THAT_KEY`; after that the device is
remembered for a year (cookie). Generate a key once:

```bash
openssl rand -hex 16
```

Keep it somewhere you can copy from your phone (a note, a password manager).

## 2. Deploy (choose one)

### A. Git integration (recommended: no terminal, redeploys on every push)

1. https://vercel.com/new -> Import `jfeelx17/kenosha-transit-brain`.
2. **Root Directory**: click Edit and choose `frontend`. Framework preset: Next.js (auto).
3. **Environment Variables**: add `APP_ACCESS_KEY` = the key from step 1.
   (Optional: `NEXT_PUBLIC_MAP_STYLE`, `NEXT_PUBLIC_POLL_VEHICLES_MS`, see `frontend/.env.example`.)
4. Deploy. Two to three minutes later you have `https://<project>.vercel.app`.

Every later `git push` to `main` redeploys automatically; pushes to other branches get
preview URLs.

### B. Vercel CLI (you already have it installed)

```bash
cd frontend
vercel login
vercel link            # new project; accept defaults (the project root is this folder)
vercel env add APP_ACCESS_KEY production   # paste the key
vercel --prod
```

## 3. Open it on the phone and install

1. Open `https://<project>.vercel.app/?key=THE_KEY` once in the phone's browser. The key
   disappears from the address bar and the device is unlocked.
2. Android Chrome: menu -> **Install app** (or **Add to Home screen**).
   iPhone Safari: Share -> **Add to Home Screen**.
3. Do the same once on the Chromebook if you want it there too.

## 4. What runs where

| Part | Where | Cost |
|---|---|---|
| Map app (`frontend/`) | Vercel Hobby | $0 |
| Live data | kenoshatransit.com's own public proxy, called from Vercel's functions | $0 |
| Basemap tiles | OpenFreeMap (default) | $0 |
| Data hub (Flask), PDFs, knowledge base | Your Chromebook | $0 |

Vercel's free tier limits (100 GB bandwidth, 100 GB-hours of function time per month) are far
above what one person polling every 10-15 seconds uses.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| "Kenosha Loop is private" page | Open the URL with `?key=…` once on that device. Keys are case-sensitive. |
| Map shows "Couldn't load routes" | Open `https://<project>.vercel.app/api/debug/discover` (unlocked device) and send the output. |
| Changes not showing after a push | Vercel deploys `main`. Check the Deployments tab for a failed build; `npm run build` locally reproduces it. |
| Want to rotate the key | Change `APP_ACCESS_KEY` in Vercel, redeploy, and re-open with the new `?key=` on each device. |
