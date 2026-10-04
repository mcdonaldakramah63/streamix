# Streamix

A self-hosted streaming front-end: browse TMDB, keep a watchlist and viewer profiles, and play
titles through third-party embeds (or direct HLS streams for anime). Everything runs on your
own machine — there is no Railway/Netlify deployment anymore.

UI design: Stitch project **“Movie Stream Tracker”** (Obsidian Cinema design system —
scarlet `#E50914`, cinema gold `#F59E0B`, ion cyan `#06B6D4`, Plus Jakarta Sans).

## Requirements

- Node.js 18+ (tested on 24)
- A MongoDB database — the existing Atlas cluster in `backend/.env` works, or run MongoDB locally
  and set `MONGO_URI=mongodb://127.0.0.1:27017/streamix`
- A TMDB API key (already in `backend/.env`)

## Run it

```bash
npm run setup     # first time only: installs backend + frontend packages
npm run dev       # API on http://localhost:5000, app on http://localhost:5173
```

Open **http://localhost:5173**. Vite proxies `/api` and the `/ws` WebSocket to the backend.

### Single-port mode

```bash
npm run build     # builds frontend/dist
npm start         # serves API + built app on http://localhost:5000
```

Other devices on your network can use `http://<your-computer-ip>:5000` (add that origin to
`ALLOWED_ORIGINS` in `backend/.env` if the browser reports a CORS error).

## Configuration — `backend/.env`

See `backend/.env.example`. Required: `MONGO_URI`, `JWT_SECRET`, `TMDB_API_KEY`.

## How it fits together

| Area | Where |
|---|---|
| API server, security middleware, serving the built app | `backend/server.js` |
| Auth (15-min access token + 30-day HttpOnly refresh cookie) | `backend/controllers/authController.js`, `frontend/src/services/api.ts` |
| Login/logout side effects (sync watchlist, profiles, history) | `frontend/src/services/session.ts` |
| Profiles, bcrypt-hashed PINs, kids mode, recommendations | `backend/controllers/profileController.js`, `frontend/src/stores/profileStore.ts` |
| Playback — embeds, anime HLS via `aniwatch`, offline | `frontend/src/pages/Player.tsx`, `backend/controllers/streamController.js` |
| HLS proxy (blocks localhost/private network targets) | `GET /api/stream/proxy?url=` |
| Offline downloads (segments stored in IndexedDB) | `frontend/src/stores/downloadStore.ts` |
| Cross-device progress sync | `backend/websocket.js`, `frontend/src/hooks/useWebSocket.ts` |
| Admin console | `/admin` (grant the first admin in MongoDB: set `isAdmin: true` on your user) |

## Adding your own videos (admin)

### From the command line (bulk, local files or URLs)

```bash
npm run upload -- ~/Videos/Films "~/Videos/Shows/Doctor Who" more-urls.txt https://archive.org/details/TheGeneral1926
npm run upload -- --dry-run ~/Videos        # see how every file is understood first; changes nothing
```

`scripts/library-upload.js` signs in as you (admin; 2FA supported, or set `STREAMIX_EMAIL` / `STREAMIX_PASSWORD`) and:

- scans folders for videos (mp4, m4v, webm, mov, mkv, ogv), skipping samples, trailers, extras and half-finished downloads;
- reads names like the server does (`S01E02`, `1x02`, `Episode 5`, years, `{tmdb-57243}`, `tt0013442`), and lets weak
  names borrow from their folders — `Doctor Who (2005)/Season 2/E05.mp4` becomes *Doctor Who S02E05*;
- puts files in the library folder (`LIBRARY_DIR`, default `backend/media/`) under `Movies/` and `Shows/<Show>/Season N/`
  — hard-linked when possible so no extra disk space is used (`--mode copy|move` to change);
- skips anything already in the library, imports in batches of 200, and lets the server link each video to TMDB;
- shows the top suggestions for every unsure match so you can pick one, type `movie:ID` / `tv:ID s1e2`, or skip;
- writes a JSON report. Options: `--license`, `--yes`, `--hint "tv:1399"`, `--no-review`, `--no-match`, `--server`.

Files on this computer are streamed by the server itself (with seeking and resumable downloads). Run the script on
the machine that runs the server.

### From the admin console

Admin → **Library** tab: paste up to 200 URLs at once, one per line.

```
https://archive.org/details/TheGeneral1926
https://example.com/videos/my-film.mp4 | My Film | 2024
https://example.com/videos/nosferatu.mp4 | movie:653
https://example.com/videos/show-ep2.mp4 | tv:1399 s1e2
https://example.com/videos/film.mp4 | https://www.themoviedb.org/movie/653-nosferatu
```

- Direct links to `.mp4`, `.webm` or `.m3u8` files, or Internet Archive item pages (resolved to the
  best playable file, with title, year, description, poster and licence filled in automatically).
- You must pick how you hold the rights (public domain, Creative Commons, own content, licensed) and
  confirm before importing; the licence is stored and shown on each title.
- **Smart matching** (`backend/utils/mediaMatcher.js`) reads the file name and anything typed after
  the URL — `S04E09`, `s4 ep 9`, `Season 2 Episode 10`, `4x09`, `- 1105` (anime numbering is mapped
  to TMDB seasons), `第9集`, years, release-group/quality/language junk, `tv:206484`, `movie 653`,
  `tt0013442` — then scores TMDB candidates (name and alternative titles, year, movie-vs-series fit,
  whether the episode exists, popularity) into a confidence. It links automatically at ≥ 80% when
  clearly ahead of the runner-up; otherwise it keeps up to 5 suggestions you can accept in one click.
  Every link you make by hand is remembered, so the next file with the same name links by itself.
  Optional: set `ANTHROPIC_API_KEY` in `backend/.env` and unclear cases are double-checked by Claude
  (`MATCH_AI_MODEL` overrides the model).
- Each file is linked to its TMDB movie or series episode (matched from the file name — `S01E05`,
  `Episode 5` and `Show - 05` are understood — or set explicitly with `movie:ID` / `tv:ID s1e2` /
  a themoviedb.org link). Linked files play as the **Streamix** source on that movie's or episode's
  normal page, before the embed sources, and the detail page shows an "On Streamix" badge.
- Unlinked titles are marked "Not linked" in the Library list: use **Re-match unlinked**, or click
  edit and search TMDB to pick the movie (or series + season + episode). Saving a link refreshes the
  title, poster and description. Unlinked titles still play from the Home row at `/watch/<id>`.
  When two titles fit a file name equally well, it is left unlinked instead of guessing.
- MediaFire links (page or direct download links) are stored by file, and a fresh download link is
  looked up whenever the video is played or downloaded, because MediaFire's direct links expire.
- Signed-in users get a **Download** button on library videos (player header, `/watch/<id>`, and the
  admin list). The file is sent through the server with resume support, so it works for any host.
- Internet Archive items that only contain a film split into parts are rejected — use a single-file copy.

## Features for viewers

Everything below is free for every account. Limits can be set later in **Admin → Settings**
(0 = unlimited) without code changes.

- **Watch parties** — "Watch party" in the player header. Share the invite link or 6-letter code.
  Play, pause and seeking follow the host for Streamix library files and direct (HLS) streams. Embed
  sources can't be controlled, so the host gets a 3‑2‑1 countdown instead. Live chat, emoji
  reactions, host hand-over when the host leaves, and the host can remove people.
- **Player** — load your own `.srt`/`.vtt` subtitles; subtitle size, colour and background;
  speed, volume, subtitle style and auto-skip are remembered; volume boost up to 300% (same-origin
  streams only — browsers mute boosted audio from other sites); cast to a TV (Chrome/Android) or
  AirPlay (Safari) for file videos; "Skip intro" and "Next episode" buttons for anime streams that
  provide timings and for library videos (set the times in Admin → Library → edit).
- **Recommendations** — "Because you watched …" for your two latest titles, "This week's picks"
  (changes every Monday), top picks and series suggestions.
- **Kids controls** — Profile → kids profile → Controls (needs a parent profile's PIN when one
  exists): daily screen-time limit, bedtime, "only titles I pick", blocked titles, and a weekly
  activity report. The kids app shows minutes left and locks at the limit or bedtime.
- **Collections** — Admin → Collections: hand-picked rows on Home mixing movies, series and
  library videos.
- **Themes & badges** — each profile picks an accent colour and earns badges (Founding Member for
  accounts made before `FOUNDING_UNTIL`, default 2027‑07‑01; Movie Buff, Binge Watcher, Anime Fan…).
- **App install & notifications** — Profile → Account. Push notifications for new episodes of shows
  in My List / Continue Watching, new library videos, and a weekly pick; admins can also broadcast
  from Admin → Settings. Push needs the built app (`npm run build`, served by the backend) and
  https or localhost — a phone opening `http://<LAN-IP>:5000` can't receive push. Keys are created
  automatically on first use.
- **Two-factor sign-in** — Profile → Account → Security: authenticator-app codes (any TOTP app),
  8 one-time backup codes, plus a list of recent sign-ins and "Sign out everywhere".
- **Coming up** — `/upcoming` (also a Home row and a button in My List): new and upcoming episodes for
  shows in My List / Continue Watching.
- **Watched ticks** — series pages show ✓ and progress bars per episode for the current profile;
  mark single episodes or a whole season as watched.
- **Search filters & Surprise me** — filter results by genre, years, rating and language; "Surprise
  me" opens a random well-rated title (kid-safe in kids mode).
- **Report a problem** — flag button in the player; reports collect in Admin → Reports (repeat
  reports of the same problem are merged).
- **New & Hot** (`/new`) — Coming Soon with "Remind me" (you get a notification on release day),
  Everyone's Watching, Top 10 Movies and Top 10 Shows. Posters in any row get a TOP 10 badge.
- **Notification bell** — new episodes of shows you follow, reminders, new library videos, weekly
  picks and admin announcements, also sent as push when notifications are on.
- **Per-profile playback settings** (Profile page) — autoplay next episode, autoplay hover previews,
  preferred subtitle language, data usage (save data / best quality) and a maturity rating (7+, 13+,
  16+, All). Titles rated above it need a parent PIN; raising it needs a parent PIN too.
- **"Not for me"** on any title hides it from rows and recommendations; manage it in
  **Viewing activity** (`/activity`), which also lists, removes and exports (CSV) watch history.
- **Player** — "Are you still watching?" after three episodes in a row without interaction, a pause
  screen with synopsis and cast, an audio-language menu for streams with several tracks, and
  double-tap left/right to skip on phones. Age-rating badges on detail pages; "Play something" on Home.
- **Not included yet:** email digests (needs an email package such as nodemailer) and payments.

## How recommendations work

`backend/utils/tasteEngine.js` (pure, unit-tested) + `backend/controllers/recommendController.js`:

1. **Signals** per profile — how far each title was watched (finishing = strong yes, bailing early
   = soft no), time spent, star ratings, My List, "Not for me", taste-onboarding picks, and light
   interest (opening a title, its trailer, a search click, pressing play). Recent behaviour counts
   more; explicit signals fade slower.
2. **Taste profile** — those weights spread over each title's genres, keywords, cast, director /
   creator, language, decade and movie-vs-series, plus what they watch at each hour of the day.
3. **Candidates** — titles similar to their strongest likes, what *other viewers on this server*
   with overlapping taste finished, favourite genres / keywords / people / language via TMDB
   discover, a little of what's trending, and acclaimed titles outside their usual genres.
4. **Scoring** — taste match + Bayesian quality (few votes don't win) + source strength + context;
   with little history it leans on quality, with more it leans on taste.
5. **Variety** — rows are picked with maximal-marginal-relevance so they aren't ten near-identical
   titles; the top row includes a small dose of "Something different".
6. **Rows with reasons** — Top picks, Because you watched/liked…, Viewers like you also watched,
   Because you like {genre}, With {person}, Hidden gems, This week's picks, Something different.
   Each pick shows why. Finished, in-progress, hidden and above-maturity titles are left out.

Rows are cached for 10 minutes per profile and rebuilt in the background when something changes.

**Smarter on top of that** (`utils/discoveryEngine.js`, pure and unit-tested, + `controllers/discoveryController.js`):

- **Learned row order** — every Home row kind is treated as a bandit arm: rows shown are "pulls", titles opened from
  a row are "wins" (both apps report the row). Rows are ordered by Thompson sampling over Beta(wins, misses) with old
  evidence decaying (21-day half-life), so rows a profile actually uses rise, and new rows still get a chance.
  Top picks always stays first.
- **Ask Streamix** (`POST /api/profiles/:id/ask`, web `/ask`, app: Home → ✨ Ask / For You → Ask) — "something funny
  and short from the 90s, not horror", "like Interstellar but less sad", "a Korean thriller to binge". The request
  becomes filters (genres, themes, titles it's like, decade, runtime, language, mood); candidates come from TMDB
  (similar titles, discover, keyword search), are ranked by fit × your taste × quality, and diversified. TV genre
  equivalents are handled (TV has no "Thriller"), and the filters loosen if nothing matches.
- **Coming up for you** (`GET /api/profiles/:id/upcoming`, New & Hot → Coming Soon) — the next film in collections
  you watched, new work from directors/actors you like, season premieres and new episodes of shows you follow, and
  upcoming titles scored by taste + pre-release popularity + how soon, each with a reason.
- **For You feed** (`GET /api/profiles/:id/feed`, app tab "For You", web vertical feed) — stories from new episodes,
  premieres, the server's library, your upcoming picks, top picks, what viewers on this server finished, new releases
  people love and taste-filtered trending. Score = kind weight × (0.35 + 0.65 × relevance) × freshness (per-kind
  half-life) × quality, × 0.55 for each time you've already been shown it; then a pass spreads kinds out so the feed
  isn't one kind in a row. Trailers are attached for the trailer-first feed.

- **Play something** (`POST /api/profiles/:id/play-something`, `utils/playEngine.js`) — picks one thing to start now
  from: resume (half-watched, this profile only), the next episode, new episodes of shows you follow, your top picks,
  new library videos, and acclaimed titles when there's little history. Utility = kind × freshness + taste + quality +
  whether what's left fits the time you probably have (late night ≈ 50 min, Friday evening ≈ 3 h) + your habits at
  this hour (series vs films). A learned multiplier per kind (Thompson sampling on how often you actually watch what
  each kind suggests) and a softmax draw among the best few, so pressing again gives a different good pick; skipping a
  kind twice moves on to another kind. Web: Home → Play something. App: Home → 🎲 Play something, Explore → Surprise me.
- **Which video source plays first** (`utils/sourceHealth.js`, `services/sourceTracker.js`, `GET /api/stream/sources`)
  — providers are no longer hard-coded in the apps. The server checks every provider's player page every 20 minutes and
  learns from sessions: watched 3+ minutes = worked; failed to load, switched away within a minute, or "won't play"
  reports = didn't (7-day half-life). Beta-posterior ranking, a provider that's down sinks to the end, 10% exploration.
- **New & Hot** (`utils/trendEngine.js`, `services/trendTracker.js`, `GET /api/movies/new-hot`, `GET /api/profiles/:id/new-hot`)
  — every 30 minutes the server snapshots TMDB's charts and scores titles by popularity, **momentum** (popularity growth
  and rank climb vs ~24 h ago), **local heat** (plays, completions, views and trailers on this server, 24 h half-life),
  a fresh-release bump and a Bayesian quality floor. Lists: Everyone's Watching, Rising Fast (fills in after a few hours
  of history), Just Released, Top 10 Movies / Shows (the Top 10 badges use them too). For a profile they're re-ranked
  70% hotness / 30% taste, minus hidden and finished titles; kids profiles get lists built from kid-safe charts. When
  the lists change, the server tells open apps over the WebSocket; the web page also refreshes every 10 minutes and the
  app every 10 minutes and when you come back to it. The Home hero uses the same personalised hot list.
- **Search** (`utils/searchEngine.js`, `GET /api/movies/smart-search`, `GET /api/movies/suggest`) — understands the query
  ("dune 1984", "breaking bad season 2", "the office s03e07", "dune series", "rocky ii", accents, "&"/"and"), pulls
  results from titles, people (a person's real roles — "tom hanks" → Toy Story, Forrest Gump, not documentaries about
  him), franchises ("harry potter" → every film) and this server's library ("On Streamix"). Ranking: IDF-weighted word
  coverage × precision with typo tolerance and prefix matching for half-typed words, + year/type agreement, popularity,
  Bayesian quality, your taste, and what people who typed the same query went on to open (learned, 30-day half-life).
  Spelling fixes ("intersteller" → Interstellar) and instant suggestions while typing on web and app.
- **Robust TMDB access** (`config/tmdb.js`) — everything above sits on one client: per-request-type freshness with
  stale-while-revalidate, the last good answer served when TMDB is down, shared in-flight requests, at most 8 calls at
  a time, one retry with backoff (Retry-After respected) and a circuit breaker after 8 failures in a row.
- **Continue Watching order** (`utils/continueWatching.js`) — by how likely you are to pick each one up now: recency
  (4-day half-life) × engagement (mid-way beats barely started; "up next" while bingeing is hottest).

**With Claude** (set `ANTHROPIC_API_KEY` in `backend/.env`; `utils/ai.js`, model `claude-opus-5-5` at low effort,
`RECS_AI_MODEL` overrides): Ask Streamix gets Claude to turn the request into filters and to pick the final titles
from the ranked shortlist with a one-line reason each; top picks, upcoming picks and the first feed headlines get
personal one-line reasons, written in the background so pages never wait. Answers are schema-checked JSON, refusals
fall back to the recommended model, results are cached, and `AI_ASKS_PER_HOUR` (default 30) caps Ask per account.
Without a key everything above still works on the algorithms alone.
New profiles get a "pick 3+ you like" screen. "More like this" on title pages, search ranking
(typo-tolerant, "Showing results for…") and Continue Watching (finished episodes become "Up next")
use the same signals. Run the tests with `cd backend && npm test`.

## Security

- Sign-in: 15-minute access tokens + 30-day refresh cookie (HttpOnly, SameSite=Strict). Changing the
  password, "Sign out everywhere", turning on two-factor, an admin password reset or a suspension
  end every existing session. Failed sign-ins are throttled per device + email, so nobody can lock
  someone else out and responses don't reveal which emails are registered.
- Changing the account email needs the password. Profile PINs are needed to change/remove a PIN,
  switch a profile between kids and adult, or delete it (a parent PIN for kids profiles); wrong PINs
  are rate-limited.
- Outgoing requests (stream proxy, library imports, MediaFire/Archive lookups, push) refuse private
  and local addresses after DNS resolution and on every redirect. The stream proxy only serves links
  the server signed, only as media types, with a sandboxing CSP.
- The built app is served with a Content-Security-Policy (only Streamix's own scripts run),
  `X-Frame-Options`, `nosniff` and a Permissions-Policy. Server error details never reach the browser.
- Dependencies: `npm audit` reports 0 vulnerabilities in both apps (Vite 8, React Router 7).
- Video embeds from third-party sites run in iframes without a sandbox (sandboxing breaks most of
  them); the pop-up blocker in `frontend/src/utils/adBlocker.ts` limits what they can open.

## Notes

- Anime direct streams depend on the `aniwatch` package's source site. If it's offline the
  player automatically falls back to the embed sources. `ANIWATCH_DOMAIN` overrides the site.
- Offline downloads only work for direct HLS streams; embeds can't be downloaded.
- Kids mode has search plus Kids Shows, Cartoons, Anime, Anime Movies, Family and more. The server
  only returns titles whose strictest US rating is G/PG or TV-Y…TV-PG (unrated titles need a Kids or
  Family genre), so kid-friendly anime like Pokémon and Doraemon appears and mature anime doesn't.
- Leaving kids mode returns to “Who's watching?”. Give adult profiles a PIN to keep kids out.
