import { XMLParser } from "fast-xml-parser";
import { fetchText } from "@/lib/http";
import type { AdapterResult, SourceAdapter, SourceRecord } from "./types";

/**
 * Podcast adapter: reads an RSS feed and extracts tracklists from episode
 * show notes. Tracklist formats differ per show, so extraction is heuristic:
 * we look for "Artist - Title" style lines and filter out prose.
 */

interface RssItem {
  title?: string;
  guid?: string | { "#text"?: string };
  pubDate?: string;
  description?: string;
  "content:encoded"?: string;
}

export const podcastAdapter: SourceAdapter = {
  async scan(source: SourceRecord, alreadyProcessed: Set<string>): Promise<AdapterResult> {
    const feedUrl = await resolveFeedUrl(source);
    const xml = await fetchText(feedUrl);
    const items = parseFeedItems(xml);

    const result: AdapterResult = { candidates: [], processedItems: [], warnings: [] };
    const maxEpisodes = (source.config.maxEpisodesPerScan as number) ?? 5;

    let inspected = 0;
    for (const item of items) {
      if (inspected >= maxEpisodes) break;
      const externalId = itemGuid(item);
      if (!externalId || alreadyProcessed.has(externalId)) continue;
      inspected++;

      const episodeTitle = item.title ?? "Untitled episode";
      const html = item["content:encoded"] ?? item.description ?? "";
      const tracks = extractTracklist(html);
      if (tracks.length === 0) {
        result.warnings.push(`No tracklist found in episode "${episodeTitle}"`);
      }
      const date = item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : "";
      for (const t of tracks) {
        result.candidates.push({
          ...t,
          context: date ? `${episodeTitle} (${date})` : episodeTitle,
          externalId,
          externalTitle: episodeTitle,
        });
      }
      result.processedItems.push({ externalId, title: episodeTitle });
    }
    return result;
  },
};

/**
 * A source can be configured with a direct RSS `feedUrl`, or with an
 * `applePodcastId` — in that case the feed URL is resolved through Apple's
 * public lookup API, which stays correct even if the show changes hosts.
 */
async function resolveFeedUrl(source: SourceRecord): Promise<string> {
  if (source.config.feedUrl) return source.config.feedUrl as string;
  if (source.config.applePodcastId) {
    const lookup = await fetchText(
      `https://itunes.apple.com/lookup?id=${source.config.applePodcastId}`,
    );
    const data = JSON.parse(lookup) as { results?: { feedUrl?: string }[] };
    const feedUrl = data.results?.[0]?.feedUrl;
    if (feedUrl) return feedUrl;
    throw new Error(`Could not resolve RSS feed for Apple podcast id ${source.config.applePodcastId}`);
  }
  return source.url;
}

export function parseFeedItems(xml: string): RssItem[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel;
  if (!channel) return [];
  const items = channel.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function itemGuid(item: RssItem): string | null {
  if (typeof item.guid === "string") return item.guid;
  if (item.guid && typeof item.guid === "object" && item.guid["#text"]) return item.guid["#text"];
  return item.title ?? null;
}

/** Lines in show notes that should never be read as "Artist - Title". */
const NOISE = /https?:\/\/|www\.|@|©|\b(podcast|aflevering|episode|shownotes|tracklist|playlist|abonneer|subscribe|volg ons|instagram|spotify|apple)\b/i;

const SEPARATORS = /\s+[-–—−]\s+|\s+[-–—−](?=\S)|(?<=\S)[–—](?=\S)/;

/**
 * Extract (artist, title) pairs from show-notes HTML. Strategy: convert the
 * HTML to lines, keep lines that look like "Artist - Title" (optionally
 * numbered or timestamped), reject lines that look like prose or links.
 */
export function extractTracklist(html: string): { artist: string; title: string }[] {
  const lines = htmlToLines(html);
  const found: { artist: string; title: string }[] = [];

  for (let line of lines) {
    // strip leading numbering ("1.", "01)", "1 -") and timestamps ("[12:34]", "12:34")
    line = line
      .replace(/^\s*\[?\d{1,2}:\d{2}(:\d{2})?\]?\s*[-–—.]?\s*/, "")
      .replace(/^\s*\d{1,3}\s*[.)\-:]\s*/, "")
      .trim();

    if (!line || line.length > 120 || NOISE.test(line)) continue;

    const parts = line.split(SEPARATORS).map((p) => p?.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const artist = cleanField(parts[0]);
    // titles sometimes contain a dash themselves; rejoin the remainder
    const title = cleanField(parts.slice(1).join(" - "));
    if (!plausibleField(artist) || !plausibleField(title)) continue;

    found.push({ artist, title });
  }
  return found;
}

function htmlToLines(html: string): string[] {
  return html
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function cleanField(s: string): string {
  return s
    .replace(/^["'""']+|["'""']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A plausible artist or title: short-ish, has letters, not a sentence. */
function plausibleField(s: string): boolean {
  if (!s || s.length < 2 || s.length > 80) return false;
  if (!/[a-zA-ZÀ-ɏ]/.test(s)) return false;
  if (s.split(/\s+/).length > 9) return false;
  return true;
}
