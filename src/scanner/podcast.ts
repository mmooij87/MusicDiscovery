import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { fetchText, politePause } from "@/lib/http";
import { normalize, similarity } from "@/lib/normalize";
import type { AdapterResult, SourceAdapter, SourceRecord } from "./types";

/**
 * Podcast adapter: reads an RSS feed and extracts tracklists from episode
 * show notes. Some shows (St. Paul's Boutique) publish the tracklist on the
 * episode's webpage instead of in the show notes — for those the adapter
 * follows the episode link, or finds the episode page via the podcast's
 * website (source.url), and extracts the tracklist from the page HTML.
 *
 * Tracklist formats differ per show, so extraction is heuristic: we look for
 * "Artist - Title" style lines and filter out prose.
 */

interface RssItem {
  title?: string;
  link?: string;
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
    const indexUrl = (source.config.episodeIndexUrl as string) ?? source.url;

    // the podcast's website page, fetched lazily and at most once per scan —
    // it holds the per-episode "Tracklist #N" sections and the episode links
    let indexHtml: string | null = null;
    const getIndexHtml = async (): Promise<string> => {
      if (indexHtml === null) {
        indexHtml = await fetchText(indexUrl).catch((err) => {
          result.warnings.push(`Could not load podcast page ${indexUrl}: ${err}`);
          return "";
        });
      }
      return indexHtml;
    };

    let inspected = 0;
    const maxAgeDays = (source.config.episodeMaxAgeDays as number) ?? 90;
    for (const item of items) {
      if (inspected >= maxEpisodes) break;
      const externalId = itemGuid(item);
      if (!externalId || alreadyProcessed.has(externalId)) continue;
      // don't keep digging into old episodes whose tracklists have rolled
      // off the podcast's website
      if (item.pubDate) {
        const age = Date.now() - new Date(item.pubDate).getTime();
        if (Number.isFinite(age) && age > maxAgeDays * 24 * 3600 * 1000) continue;
      }
      inspected++;

      const episodeTitle = item.title ?? "Untitled episode";
      const html = item["content:encoded"] ?? item.description ?? "";
      let tracks = extractTracklist(html);

      // 1) tracklist not in the show notes? look for a "Tracklist #N"
      //    section on the podcast's website page
      const epNum = episodeNumber(episodeTitle);
      if (tracks.length === 0 && epNum) {
        tracks = extractTracklistForEpisode(await getIndexHtml(), epNum);
      }

      // 2) still nothing? follow the episode's own webpage(s)
      let pageUrls: string[] = [];
      if (tracks.length === 0) {
        const episodeIndex = parseEpisodeLinks(await getIndexHtml(), indexUrl);
        const noteLinks = extractLinks(html, source.url);
        pageUrls = [
          ...noteLinks,
          ...candidateEpisodePages(item, episodeIndex).filter((u) => !noteLinks.includes(u)),
        ].slice(0, 4);
        for (const pageUrl of pageUrls) {
          try {
            await politePause();
            const pageHtml = await fetchText(pageUrl);
            tracks = extractTracklistFromPage(pageHtml);
            if (tracks.length > 0) break;
          } catch (err) {
            result.warnings.push(`Could not fetch episode page ${pageUrl}: ${err}`);
          }
        }
      }

      if (tracks.length === 0) {
        const notesPreview = htmlToLines(html).join(" / ").slice(0, 250);
        result.warnings.push(
          `No tracklist found for episode "${episodeTitle}" (episode number: ${epNum ?? "?"}, tried ${pageUrls.length} page(s): ${pageUrls.join(", ") || "none"}). Show notes start with: "${notesPreview}"`,
        );
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
      // only mark processed when we found tracks, so episodes whose pages
      // failed (or whose format defeats the parser today) retry next scan
      if (tracks.length > 0) {
        result.processedItems.push({ externalId, title: episodeTitle });
      }
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

interface EpisodeLink {
  href: string;
  text: string;
}

/** Hosts that never host a tracklist page (players, socials, stores). */
const LINK_HOST_BLOCKLIST =
  /spotify\.com|apple\.com|podbean\.com|soundcloud\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|twitter\.com|x\.com|tiktok\.com|linktr\.ee/i;

/**
 * Pull URLs out of show-notes HTML ("Benieuwd naar de tracklist? Check ze
 * via …"). Links on the podcast's own website come first; the podcast index
 * page itself is excluded so we don't read another episode's tracklist.
 */
export function extractLinks(html: string, podcastSiteUrl: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) found.add(m[1]);
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>()\\]+/g)) found.add(m[0]);

  let siteHost: string | null = null;
  let sitePath = "";
  try {
    const u = new URL(podcastSiteUrl);
    siteHost = u.hostname.replace(/^www\./, "");
    sitePath = u.pathname.replace(/\/$/, "");
  } catch {
    /* keep null */
  }

  const own: string[] = [];
  const other: string[] = [];
  for (const raw of found) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    if (LINK_HOST_BLOCKLIST.test(url.hostname)) continue;
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "");
    if (siteHost && host === siteHost) {
      if (path === sitePath || path === "") continue; // the index itself
      own.push(url.href);
    } else {
      other.push(url.href);
    }
  }
  return [...own, ...other];
}

/** "#281: Blood Orange…" or "281 - …" → "281". */
export function episodeNumber(title: string): string | null {
  return title.match(/#\s*(\d{1,4})\b/)?.[1] ?? title.match(/^\s*(\d{1,4})\b/)?.[1] ?? null;
}

/**
 * Extract one episode's tracklist from the podcast's website page, which
 * lists sections like "Tracklist #281" followed by "Artist - Title" lines
 * (St. Paul's Boutique style). The section ends at the next
 * "Tracklist"/"Shownotes" heading or the first non-track line.
 */
export function extractTracklistForEpisode(
  pageHtml: string,
  epNum: string,
): { artist: string; title: string }[] {
  if (!pageHtml) return [];
  const $ = cheerio.load(pageHtml);
  $("nav, header, footer, script, style, noscript, aside, form").remove();
  const scope = $("main, article, [class*=content], #content").first();
  const lines = htmlToLines((scope.length ? scope : $("body")).html() ?? "");

  const startRe = new RegExp(`^tracklist\\s*(?:#|nr\\.?\\s*|aflevering\\s*)?${epNum}\\b`, "i");
  const start = lines.findIndex((l) => startRe.test(l));
  if (start === -1) return [];

  const tracks: { artist: string; title: string }[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^(tracklist|shownotes)\b/i.test(line)) break;
    // a heading rendered inline can glue onto the last track ("…SinnermanShownotes")
    const track = parseTrackLine(line.replace(/shownotes\s*$/i, "").trim());
    if (track) tracks.push(track);
    else if (tracks.length > 0) break;
  }
  return tracks;
}

/**
 * The podcast's website lists its episodes with links to the per-episode
 * pages. Collect links under the podcast's own path, or elsewhere on the
 * site mentioning the podcast's slug.
 */
export function parseEpisodeLinks(html: string, indexUrl: string): EpisodeLink[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const base = new URL(indexUrl);
  const links: EpisodeLink[] = [];
  const seen = new Set<string>();

  // the podcast's slug, e.g. "st-pauls-boutique" — episode pages may live
  // beside the index (/podcast/st-pauls-boutique-281-…) instead of under it
  const slug = base.pathname.split("/").filter(Boolean).pop() ?? "";

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")!;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      return;
    }
    if (abs.hostname !== base.hostname) return;
    const underIndex = abs.pathname.startsWith(base.pathname);
    const mentionsSlug = slug !== "" && abs.pathname.includes(slug);
    if (!underIndex && !mentionsSlug) return;
    // not the index page itself
    if (abs.pathname.replace(/\/$/, "") === base.pathname.replace(/\/$/, "")) return;
    if (seen.has(abs.href)) return;
    seen.add(abs.href);
    links.push({ href: abs.href, text: $(el).text().replace(/\s+/g, " ").trim() });
  });
  return links;
}

/**
 * Pick the webpage(s) most likely to hold this episode's tracklist: the best
 * match from the podcast site's episode index (by episode number, then title
 * similarity), then the RSS item's own <link>.
 */
export function candidateEpisodePages(
  item: { title?: string; link?: string },
  index: EpisodeLink[],
): string[] {
  const urls: string[] = [];
  const title = item.title ?? "";
  const epNum = title.match(/#\s*(\d{1,4})\b/)?.[1] ?? title.match(/^\s*(\d{1,4})\b/)?.[1];

  let best: { href: string; score: number } | null = null;
  for (const link of index) {
    let score = 0;
    if (epNum) {
      const inText = new RegExp(`#\\s*${epNum}\\b`).test(link.text);
      const inHref = new RegExp(`[/-]${epNum}[/-]|[/-]${epNum}$`).test(link.href);
      if (inText || inHref) score += 1;
    }
    score += similarity(normalize(link.text), normalize(title));
    if (score > 0.6 && (!best || score > best.score)) best = { href: link.href, score };
  }
  if (best) urls.push(best.href);
  if (item.link && !urls.includes(item.link)) urls.push(item.link);
  return urls;
}

/** Lines in show notes that should never be read as "Artist - Title". */
const NOISE = /https?:\/\/|www\.|@|©|\b(podcast|aflevering|episode|shownotes|tracklist|playlist|abonneer|subscribe|volg ons|instagram|spotify|apple|tickets?|agenda|nieuwsbrief|cookies?|privacy|vacatures)\b/i;

const SEPARATORS = /\s+[-–—−]\s+|\s+[-–—−](?=\S)|(?<=\S)[–—](?=\S)/;

/**
 * Extract (artist, title) pairs from show-notes HTML. Strategy: convert the
 * HTML to lines, keep lines that look like "Artist - Title" (optionally
 * numbered or timestamped), reject lines that look like prose or links.
 *
 * `minRun` keeps only groups of at least that many consecutive matching
 * lines — on full webpages this separates a real tracklist from stray
 * dash-separated nav/footer items.
 */
export function extractTracklist(
  html: string,
  { minRun = 1 } = {},
): { artist: string; title: string }[] {
  const lines = htmlToLines(html);
  const found: { artist: string; title: string }[] = [];
  let run: { artist: string; title: string }[] = [];

  const flush = () => {
    if (run.length >= minRun) found.push(...run);
    run = [];
  };

  for (const line of lines) {
    const track = parseTrackLine(line);
    if (track) run.push(track);
    else flush();
  }
  flush();
  return found;
}

/**
 * Extract a tracklist from a full episode webpage: strip chrome (nav, footer,
 * scripts), prefer the main content area, and require a cluster of at least
 * 3 consecutive track-like lines.
 */
export function extractTracklistFromPage(html: string): { artist: string; title: string }[] {
  const $ = cheerio.load(html);
  $("nav, header, footer, script, style, noscript, aside, form").remove();
  const scope = $("main, article, [class*=content], #content").first();
  const fragment = (scope.length ? scope : $("body")).html() ?? "";
  return extractTracklist(fragment, { minRun: 3 });
}

function parseTrackLine(rawLine: string): { artist: string; title: string } | null {
  // strip leading numbering ("1.", "01)", "1 -") and timestamps ("[12:34]", "12:34")
  const line = rawLine
    .replace(/^\s*\[?\d{1,2}:\d{2}(:\d{2})?\]?\s*[-–—.]?\s*/, "")
    .replace(/^\s*\d{1,3}\s*[.)\-:]\s*/, "")
    .trim();

  if (!line || line.length > 120 || NOISE.test(line)) return null;

  const parts = line.split(SEPARATORS).map((p) => p?.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const artist = cleanField(parts[0]);
  // titles sometimes contain a dash themselves; rejoin the remainder
  const title = cleanField(parts.slice(1).join(" - "));
  if (!plausibleField(artist, 6) || !plausibleField(title, 14)) return null;

  return { artist, title };
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
function plausibleField(s: string, maxWords: number): boolean {
  if (!s || s.length < 2 || s.length > 80) return false;
  if (!/[a-zA-ZÀ-ɏ]/.test(s)) return false;
  if (s.split(/\s+/).length > maxWords) return false;
  return true;
}
