# The Loop Doctrine

How this repository gets built and what gets bet on next. Written after the v0.2 cycle, when
the question stopped being "does it work" and became "what is it for".

---

## 1. The lens: one user, broad access, real security

Being a single-user app is the advantage, not the limitation. A public transit app cannot know
where you live, when you leave, which stop is yours, or how fast you walk, because it would
need consent, a privacy policy and a support team for all of it. This app can, because you are
the only user and the data never leaves your hands.

Every feature classifies its data before it is written:

| Class | Examples | Where it lives | Rule |
|---|---|---|---|
| Public transit data | routes, stops, vehicles, arrivals, alerts | fetched live through the site's own proxy, cached seconds to minutes on the server | poll gently, never store it next to personal context |
| Personal | home and work, saved stops, trips, walking pace, location | **the phone only** (localStorage), exportable as JSON | the server holds nothing personal; the serverless functions stay stateless |
| Derived evidence | prediction-vs-actual rows, reliability statistics | on the device first, shareable later if an agency ever wants it | design the format now so it needs no rework later |
| Secrets | the access key | Vercel environment variable plus an httpOnly cookie | rotate on leak; never in git, docs or screenshots |

What follows from that: keep the key gate (proportional for one user, and there are no accounts
to breach), keep the server stateless, keep every write of personal data on the device, and ship
Export / Import so that losing the phone is not losing the product.

**"Me now, agency later"** adds two disciplines from day one. Log predictions against reality in
a shape that could be handed over. And stop pretending to be Chrome: `TRANSIT_USER_AGENT` sets
the identity we send upstream, and `/api/debug/upstream?ua=honest` tests an honest one against
the live site. No endpoint the public site does not itself call, and polling at or below the
rate the site's own page uses.

---

## 2. Where the value actually is

**The paradigm is not "where is the bus".** Every app does that, and the big ones do it better.
The paradigm is **"when do I leave"**. Said plainly: *never run for a bus, never wait in the
cold.* The app should tell you to put your shoes on at the right minute, tell you how full the
bus is, and be right often enough that you stop checking.

**From first principles**, a bus is a shared vehicle on a fixed path with an uncertain clock.
The rider's real cost is not travel time, it is uncertainty, paid in early arrivals and missed
trips. The fix is a personal prediction layer that combines the live feed with *your* constants
(stop, direction, walk time, tolerance) and eventually with *observed* reliability. The vendor
will never build it, because it needs personal data and trust they do not want to hold.

**The honest feasibility verdict.** A solo developer will not disrupt the public transit market.
Transit App, Google Maps, Moovit and the vendor's own app own the mass market. Three real
whitespaces remain:

1. Personal automation that large apps avoid, because it needs deep personal data and trust.
2. Hyperlocal truth data that nobody collects for small cities.
3. The dozens of small agencies sharing one mediocre vendor front end.

The joy Apple and Amazon sell is removed friction. For one rider in Kenosha, the Butler removes
the daily friction completely, and that is the only paradigm shift that can be proven at n=1.
If it works here, whitespace 3 is how it becomes more.

---

## 3. House rules

Adapted from the Rails Doctrine, Shape Up and Getting Real (Basecamp), and from what
David Heinemeier Hansson's projects actually practise: one monolith, few dependencies,
own your deployment, no framework churn.

1. **Majestic monolith.** One Next.js app, one data module (`frontend/lib/transit.js`). No new
   service unless something physically cannot run inside it.
2. **Convention over configuration.** The normalizers are the convention. A new data type gets a
   `normalizeX` next to the others and nothing else. Environment variables only for real knobs.
3. **Omakase.** The stack is chosen. No framework churn, no TypeScript migration mid-flight, no
   UI kit, no state library. Four dependencies.
4. **No build step where a plain file will do.** Plain CSS, DOM APIs for markers. Every new
   dependency needs one sentence of justification in the pull request.
5. **Sharp knives.** The owner gets power tools (`/api/debug/*`, export and import). A one-user
   app does not need childproofing.
6. **Owner happiness.** A cycle only counts if it ends with something used on the phone.
7. **Progress over stability.** n=1 means breaking changes are cheap. `docs/MILESTONES.md` is the
   changelog and the hill chart.
8. **Own your software.** Free tiers you control, data exportable as JSON, and a self-hosting
   path if the host ever becomes a problem. No lock-in.
9. **Shape Up for a team of one plus an AI.** Pitch, bet, build inside a fixed appetite, cool
   down, bet again. Hammer the scope rather than slip the date.

Corollaries: scratch your own itch, build half a product rather than a half-built one, say no by
default.

---

## 4. The betting table

Pitches waiting for a bet. The owner bets; nothing here is started on its own.

| Pitch | What it is | Appetite | Why it might win |
|---|---|---|---|
| **Background push** | A free cron worker polls your trips every minute and sends a Web Push, so the Butler works with the phone in your pocket | 1–2 weeks | The Butler only works with the app open; this makes it real. Costs a Web Push crypto detour (VAPID plus payload encryption) |
| **The trust layer** | Analyse months of evidence rows: which routes run on time, at which hour, at which stop | Small batch | Data nobody else has for Kenosha; the thing that makes an agency conversation possible |
| **Service alerts and timetable fallback** | Show the feed's alerts, and fall back to the timetable when a stop has no live prediction | Small batch | Removes the last "the screen is empty, now what" moment. Carried over from v0.3 |
| **The Kenosha Brain** | Ask a question, get an answer from the official PDFs and GTFS plus live data | 2 weeks+ | The original vision. Best after the log and the timetable exist |
| **Loop for any city** | The engine already speaks the vendor's portal API; another agency is one base URL away | 1 week | The only path from n=1 to n>1, and the one that scales |

Rabbit holes named so far: Web Push crypto on edge workers; iOS notification edge cases (install
to home screen first, verify on the actual phone, do not chase the rest); walking directions
from a routing API (straight line with a detour factor is enough); silently mixing scheduled
predictions with live ones.

Permanent no-gos: accounts, server-side personal data, multi-user, a native app, any upstream
endpoint the public site does not itself call, and rewriting the map.

---

## Sources

- The Rails Doctrine — <https://rubyonrails.org/doctrine>
- Shape Up, Ryan Singer (Basecamp) — <https://basecamp.com/shapeup>, betting table
  <https://basecamp.com/shapeup/2.2-chapter-08>
- Kamal, "deploy web apps anywhere" — <https://github.com/basecamp/kamal>
- Once / Campfire, software you run yourself — <https://once.com>
