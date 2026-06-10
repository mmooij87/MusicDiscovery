import { fetchJson } from "./http";
import { matchScore } from "./normalize";

export interface PreviewMatch {
  previewUrl: string;
  previewSource: "itunes" | "deezer";
  artworkUrl: string | null;
}

interface ItunesResult {
  artistName: string;
  trackName: string;
  previewUrl?: string;
  artworkUrl100?: string;
}

interface DeezerResult {
  title: string;
  preview?: string;
  artist: { name: string };
  album?: { cover_xl?: string; cover_big?: string };
}

const MIN_SCORE = 0.55;

/**
 * Find a ~30s audio preview for a track. Tries the iTunes Search API first
 * (no key required), then Deezer. Both also return usable cover art.
 */
export async function findPreview(artist: string, title: string): Promise<PreviewMatch | null> {
  const itunes = await findItunes(artist, title).catch(() => null);
  if (itunes) return itunes;
  return findDeezer(artist, title).catch(() => null);
}

async function findItunes(artist: string, title: string): Promise<PreviewMatch | null> {
  const term = encodeURIComponent(`${artist} ${title}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=5&country=NL`;
  const data = await fetchJson<{ results: ItunesResult[] }>(url);

  let best: { result: ItunesResult; score: number } | null = null;
  for (const result of data.results) {
    if (!result.previewUrl) continue;
    const score = matchScore({ artist, title }, { artist: result.artistName, title: result.trackName });
    if (!best || score > best.score) best = { result, score };
  }
  if (!best || best.score < MIN_SCORE) return null;
  return {
    previewUrl: best.result.previewUrl!,
    previewSource: "itunes",
    // iTunes returns 100x100; the same CDN serves larger sizes by renaming
    artworkUrl: best.result.artworkUrl100?.replace("100x100", "600x600") ?? null,
  };
}

async function findDeezer(artist: string, title: string): Promise<PreviewMatch | null> {
  const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
  const url = `https://api.deezer.com/search?q=${q}&limit=5`;
  const data = await fetchJson<{ data: DeezerResult[] }>(url);

  let best: { result: DeezerResult; score: number } | null = null;
  for (const result of data.data ?? []) {
    if (!result.preview) continue;
    const score = matchScore({ artist, title }, { artist: result.artist.name, title: result.title });
    if (!best || score > best.score) best = { result, score };
  }
  if (!best || best.score < MIN_SCORE) return null;
  return {
    previewUrl: best.result.preview!,
    previewSource: "deezer",
    artworkUrl: best.result.album?.cover_xl ?? best.result.album?.cover_big ?? null,
  };
}
