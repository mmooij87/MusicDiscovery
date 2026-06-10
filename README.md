# Music Discovery

A personal music-discovery app. Once a day it scans your own sources for new
music and presents everything in a TikTok-style feed: full-screen cover art,
30-second previews that start playing as you scroll, and one tap to open the
track in Spotify.

**Configured sources** (see `scripts/seed.ts`):

- **St. Paul's Boutique** — weekly podcast; tracklists are extracted from the
  episode show notes.
- **Musicmeter Rotatielijst** — top 10 albums of
  [musicmeter.nl/list/rotation](https://www.musicmeter.nl/list/rotation); per
  album the 3 most popular tracks from its stats page.

Every found track is matched on Spotify (cover art + link) and against
iTunes/Deezer for a 30-second preview clip.

## Quick start (local)

```bash
npm install
npm run db:push      # create the local SQLite database (data/app.db)
npm run seed         # register the sources
cp .env.example .env # then fill in the Spotify keys (see below)
npm run scan         # fetch new music now
npm run dev          # open http://localhost:3000 on your phone or desktop
```

No keys at all also works: tracks are then matched via iTunes/Deezer only and
the Spotify button falls back to a Spotify search link.

### Spotify API keys (free, 2 minutes)

1. Go to <https://developer.spotify.com/dashboard> and log in with your
   Spotify account.
2. **Create app** → name it anything (e.g. "MusicDiscovery"), set Redirect
   URI to `http://localhost:3000` (unused, but required), check **Web API**.
3. Open the app → **Settings** → copy **Client ID** and **Client secret**
   into `.env` as `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`.

## How a scan works

1. Each enabled source adapter collects *candidates* (artist + title + where
   it was found). Episodes/albums that were already processed are skipped, so
   a daily run only picks up what's new.
2. Candidates are deduped and matched on Spotify; the best result above a
   similarity threshold wins and supplies canonical spelling, album art and
   the Spotify URL.
3. A 30s preview is looked up via the iTunes Search API, falling back to
   Deezer. Candidates with neither a Spotify match nor a preview are dropped
   (usually parse noise).
4. New tracks land in the feed; unseen tracks are shown first.

Scan from the command line with `npm run scan` — the JSON summary lists per
source how many candidates and new tracks were found, plus **warnings** when
a page or feed could not be parsed (including a snippet of the received HTML,
so the parser in `src/scanner/` can be adjusted if a site changes).

## The feed

- Vertical snap-scroll, one track per screen.
- The first tap ("Tap to start listening") unlocks audio — a browser
  requirement — after that every scroll auto-plays the next preview.
- Tap the cover or the Spotify icon to open the track in Spotify.
- ♥ saves a track as liked; viewed tracks are marked seen automatically.
- Installable as a PWA: "Add to Home Screen" in your mobile browser.

## Deploy (free): Vercel + Turso

The daily scan needs a database that outlives serverless invocations; the
free [Turso](https://turso.tech) tier works with the same SQLite schema.

1. **Turso**: create a database, note the `libsql://...` URL and create an
   auth token (`turso db tokens create <db>`).
2. Apply the schema + sources against it once, from your machine:
   ```bash
   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npm run db:push
   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npm run seed
   ```
3. **Vercel**: import this repo, then set the environment variables
   `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `SPOTIFY_CLIENT_ID`,
   `SPOTIFY_CLIENT_SECRET` and `CRON_SECRET` (any random string,
   e.g. `openssl rand -hex 24`).
4. `vercel.json` already schedules **GET /api/scan** daily at 06:00 UTC;
   Vercel sends the `CRON_SECRET` automatically. Trigger one manually with
   `curl https://<your-app>.vercel.app/api/scan?secret=<CRON_SECRET>`.

## Scripts

| Command            | Does                                                |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | dev server                                          |
| `npm run scan`     | scan all sources now                                |
| `npm run seed`     | register sources (idempotent)                       |
| `npm run db:push`  | create/update the database schema                   |
| `npm test`         | parser & matching unit tests                        |
| `npx tsx scripts/demo-data.ts` | insert fake tracks to preview the UI    |

## Project layout

```
src/
  scanner/        source adapters + daily scan pipeline
    podcast.ts      RSS + tracklist extraction from show notes
    musicmeter.ts   rotation-list + album-stats scraper
    scan.ts         orchestration: match, dedupe, store
  lib/            spotify / preview (iTunes, Deezer) / fuzzy matching
  db/             drizzle schema (sources, tracks, discoveries, scans)
  app/            Next.js app: feed page + API routes
  components/     Feed (snap-scroll + audio) and TrackCard
scripts/          seed / scan / demo-data CLIs
tests/            parser tests with HTML/RSS fixtures
```
