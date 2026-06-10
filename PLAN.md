# MusicDiscovery — Plan

A personal music discovery app. Once a day it scans your sources, finds new
tracks, and presents them in a TikTok-style vertical feed: full-screen cover art,
audio starts playing automatically, swipe to the next track, tap to open it in
Spotify.

> **Status:** Phase 1 is built — see README.md for setup. This document is the
> original plan, updated to the confirmed choices.

## Confirmed decisions

| Decision | Choice |
|---|---|
| Playback in the feed | 30-second previews (no login needed; can upgrade to full Spotify playback later) |
| Platform | Mobile-first web app / PWA (installable on your home screen) |
| Hosting | Free cloud hosting (Vercel + free Turso SQLite database), daily cron job |
| Sources | St. Paul's Boutique podcast (tracklists in show notes) + Musicmeter Rotatielijst (top 10 albums → 3 most popular tracks each) |

## How it works

```
            ┌──────────────────────── daily cron (1x per day) ───────────────────────┐
            │                                                                        │
 YouTube    │  1. Fetch new uploads per channel (YouTube Data API)                   │
 channels ──┼─▶2. Extract tracks: video title ("Artist - Title") + tracklists        │
            │     in video descriptions (DJ mixes / radio shows)                     │
            │                                                                        │
 Podcast    │  3. Fetch new episodes (RSS), extract tracklists from show notes       │
 feeds ─────┼─▶                                                                      │
            │  4. Match each candidate on Spotify (search API) → canonical artist,   │
            │     title, cover art, Spotify link                                     │
            │  5. Find a 30s preview clip (iTunes/Deezer catalog match)              │
            │  6. Dedupe against tracks you've already been shown, save to DB        │
            └────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │   TikTok-style feed   │
                              │  • full-screen cover  │
                              │  • autoplay on scroll │
                              │  • source badge       │
                              │  • tap → Spotify      │
                              └───────────────────────┘
```

## The feed (frontend)

- Vertical snap-scroll feed, one track per screen (CSS scroll-snap), mobile-first.
- When a card scrolls into view its preview starts playing automatically and the
  previous one stops (IntersectionObserver). Note: browsers require one tap to
  unlock audio, so the very first card shows a play button; after that,
  scroll-autoplay works for the whole session.
- Each card shows: full-bleed album art, artist + track title, where it was found
  ("YouTube · <channel>" or "Podcast · <episode>"), and discovery date.
- Tap the artwork (or a Spotify button) → opens the track directly in the Spotify app.
- "Today" view with the latest scan results, plus an archive of earlier days.
- Tracks you've scrolled past are marked as seen so they don't come back.

## Tech stack

- **App**: Next.js (TypeScript) + Tailwind CSS, deployed on Vercel, PWA manifest so
  it installs on your phone's home screen.
- **Database**: Postgres (Neon free tier) with Drizzle ORM. Tables: `sources`,
  `tracks`, `discoveries` (track ↔ source ↔ date), `seen/liked`.
- **Daily scan**: Vercel Cron hitting an API route once a day.
- **APIs** (all free):
  - YouTube Data API v3 — new uploads + descriptions (free quota is far more than enough).
  - Podcast RSS feeds — parsed directly, no key needed.
  - Spotify Web API (client credentials) — track matching, cover art, Spotify links.
  - iTunes Search API / Deezer API — 30-second preview audio (Spotify no longer
    provides previews to new apps, these two do and need no key).

## Build phases

### Phase 1 — MVP (the core experience)
1. Project scaffold: Next.js + DB schema + local dev setup.
2. Scanner pipeline: YouTube channels + podcast RSS → track extraction →
   Spotify match → preview match → store.
3. Feed UI: snap-scroll cards, autoplay previews, cover art, Spotify deep link.
4. Runs locally first with your real sources; then deploy to Vercel + enable daily cron.

### Phase 2 — Comfort
- Source management page (add/remove YouTube channels & podcast feeds in the app).
- Like ♥ / hide buttons, seen-tracking, archive browsing, pull-to-refresh.
- PWA polish: app icon, splash screen, offline shell.

### Phase 3 — Later ideas (optional)
- Spotify login: "save to playlist" button, and full-track playback if you have Premium.
- Daily push notification: "🎵 14 new tracks found today".
- More source types: SoundCloud, Bandcamp, music blogs, 1001tracklists.

## What I need from you

1. **Your sources**: the YouTube channel names/URLs and the podcast names/RSS feeds
   you use — 2 or 3 real ones are enough to start building and tuning the
   tracklist parsing.
2. **Two free API keys** (I'll give you click-by-click instructions when we start):
   - a YouTube Data API key (Google Cloud console),
   - a Spotify app client ID + secret (developer.spotify.com).
3. Later, for deployment: a free Vercel account and a free Neon database (or I can
   set the project up so you can run everything locally first).

## Known trade-offs

- **Tracklist parsing is per-source work**: every podcast/channel formats its
  tracklists differently. The parser will be tuned per source and will skip what it
  can't confidently read rather than show garbage.
- **Previews are 30 seconds**: enough to judge a track; one tap takes you to the
  full song on Spotify. Upgrading to full in-feed playback (Spotify Premium SDK) is
  a clean Phase 3 addition, not a rewrite.
- **Matching isn't perfect**: remixes/unreleased tracks sometimes don't exist on
  Spotify; those will be shown with a YouTube link instead of being dropped.
