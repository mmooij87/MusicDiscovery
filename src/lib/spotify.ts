import { matchScore } from "./normalize";

export interface SpotifyMatch {
  spotifyId: string;
  spotifyUrl: string;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  score: number;
}

interface TokenState {
  token: string;
  expiresAt: number;
}

let tokenState: TokenState | null = null;

async function getToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (tokenState && tokenState.expiresAt > Date.now() + 30_000) return tokenState.token;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify token request failed: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenState = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenState.token;
}

interface SpotifyTrackItem {
  id: string;
  name: string;
  external_urls: { spotify: string };
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number }[] };
}

/**
 * Search Spotify for the best match of a scanned candidate. Returns null when
 * no credentials are configured or nothing scores above the threshold.
 */
export async function findOnSpotify(
  artist: string,
  title: string,
  { minScore = 0.55 } = {},
): Promise<SpotifyMatch | null> {
  const token = await getToken();
  if (!token) return null;

  const queries = [`track:"${title}" artist:"${artist}"`, `${artist} ${title}`];
  let best: SpotifyMatch | null = null;

  for (const q of queries) {
    const url = `https://api.spotify.com/v1/search?type=track&limit=5&market=NL&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "2");
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      continue;
    }
    if (!res.ok) continue;
    const data = (await res.json()) as { tracks?: { items: SpotifyTrackItem[] } };
    for (const item of data.tracks?.items ?? []) {
      const resultArtist = item.artists.map((a) => a.name).join(", ");
      const score = matchScore({ artist, title }, { artist: resultArtist, title: item.name });
      if (!best || score > best.score) {
        const images = [...item.album.images].sort((a, b) => b.width - a.width);
        best = {
          spotifyId: item.id,
          spotifyUrl: item.external_urls.spotify,
          artist: resultArtist,
          title: item.name,
          album: item.album.name,
          artworkUrl: images[0]?.url ?? null,
          score,
        };
      }
    }
    if (best && best.score >= 0.9) break; // confident hit, skip fallback query
  }

  return best && best.score >= minScore ? best : null;
}

/** Spotify search-page URL used as fallback when no confident match exists. */
export function spotifySearchUrl(artist: string, title: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;
}
