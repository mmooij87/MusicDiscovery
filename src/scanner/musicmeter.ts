import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { fetchText, mapLimit, politePause } from "@/lib/http";
import type { AdapterResult, Candidate, SourceAdapter, SourceRecord } from "./types";

/**
 * Musicmeter "Rotatielijst" adapter. Takes the top N albums from
 * https://www.musicmeter.nl/list/rotation, then for each album reads
 * /album/<id>/stats/ and picks the most popular tracks of that album.
 *
 * The site has no API, so this is an HTML scraper with layered parsing
 * strategies. If parsing fails (site redesign, bot wall), the scan records a
 * warning with a snippet of the received HTML so the parser can be fixed.
 */

const BASE = "https://www.musicmeter.nl";

export const musicmeterAdapter: SourceAdapter = {
  async scan(source: SourceRecord, alreadyProcessed: Set<string>): Promise<AdapterResult> {
    const result: AdapterResult = { candidates: [], processedItems: [], warnings: [] };
    const topAlbums = (source.config.topAlbums as number) ?? 10;
    const tracksPerAlbum = (source.config.tracksPerAlbum as number) ?? 3;

    const listHtml = await fetchText(source.url);
    const albums = parseRotationList(listHtml).slice(0, topAlbums);
    if (albums.length === 0) {
      result.warnings.push(
        `Rotatielijst parser found no albums. HTML starts with: ${listHtml.slice(0, 300)}`,
      );
      return result;
    }

    const fresh = albums.filter((a) => !alreadyProcessed.has(a.albumId));
    const perAlbum = await mapLimit(fresh, 2, async (album) => {
      try {
        await politePause();
        const statsHtml = await fetchText(`${BASE}/album/${album.albumId}/stats/`);
        const meta = parseStatsTitle(statsHtml);
        const artist = meta?.artist ?? album.artist;
        const albumTitle = meta?.album ?? album.album;
        const tracks = parsePopularTracks(statsHtml).slice(0, tracksPerAlbum);
        const candidates: Candidate[] = tracks.map((title) => ({
          artist: artist ?? "",
          title,
          context: `Rotatielijst #${album.position} — ${artist ?? "?"} - ${albumTitle ?? "?"}`,
          externalId: album.albumId,
          externalTitle: `${artist ?? "?"} - ${albumTitle ?? "?"}`,
        }));
        return { album, candidates, warning: tracks.length === 0 || !artist ? `No tracks/artist parsed for album ${album.albumId} (${albumTitle ?? "?"}). Stats HTML starts with: ${statsHtml.slice(0, 200)}` : null };
      } catch (err) {
        return { album, candidates: [] as Candidate[], warning: `Failed album ${album.albumId}: ${err}` };
      }
    });

    for (const { album, candidates, warning } of perAlbum) {
      if (warning) result.warnings.push(warning);
      result.candidates.push(...candidates.filter((c) => c.artist && c.title));
      // only mark processed when we got something, so failures retry next scan
      if (candidates.length > 0) {
        result.processedItems.push({ externalId: album.albumId, title: candidates[0].externalTitle });
      }
    }
    return result;
  },
};

export interface RotationAlbum {
  position: number;
  albumId: string;
  artist: string | null;
  album: string | null;
}

/**
 * Find album links (/album/<id>) on the rotation list page, in page order.
 * Link text is usually "Artist - Album" or the album title with the artist
 * nearby; we keep whatever we find and let the stats page <title> refine it.
 */
export function parseRotationList(html: string): RotationAlbum[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const albums: RotationAlbum[] = [];

  $('a[href*="/album/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/\/album\/(\d+)/);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);

    const text = $(el).text().replace(/\s+/g, " ").trim();
    let artist: string | null = null;
    let album: string | null = text || null;
    const dash = text.split(/\s+[-–—]\s+/);
    if (dash.length >= 2) {
      artist = dash[0].trim();
      album = dash.slice(1).join(" - ").trim();
    }
    albums.push({ position: albums.length + 1, albumId: m[1], artist, album });
  });

  return albums;
}

/** Stats page <title> looks like "Statistieken van Artist - Album (2025)". */
export function parseStatsTitle(html: string): { artist: string; album: string } | null {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return null;
  const cleaned = m[1]
    .replace(/statistieken\s+van\s+/i, "")
    .replace(/\s*[-|–]\s*musicmeter.*$/i, "")
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .trim();
  const dash = cleaned.split(/\s+[-–—]\s+/);
  if (dash.length < 2) return null;
  return { artist: dash[0].trim(), album: dash.slice(1).join(" - ").trim() };
}

/**
 * Extract the "populairste tracks" ranking from an album stats page.
 * Strategy 1: a list/table following a heading that mentions tracks.
 * Strategy 2: the table whose rows look like (text, number) pairs — a
 * track-popularity table — picked by most rows.
 */
export function parsePopularTracks(html: string): string[] {
  const $ = cheerio.load(html);

  const heading = $("h1, h2, h3, h4, th, caption, strong, b")
    .filter((_, el) => /populairste\s+(tracks|nummers)|favoriete\s+tracks/i.test($(el).text()))
    .first();

  if (heading.length) {
    const container = heading.closest("table").length
      ? heading.closest("table")
      : heading.nextAll("table, ol, ul").first();
    const titles = extractRankedTitles($, container);
    if (titles.length > 0) return titles;
  }

  // fallback: best-looking (text, count) table on the page
  let best: string[] = [];
  $("table, ol, ul").each((_, el) => {
    const titles = extractRankedTitles($, $(el));
    if (titles.length > best.length) best = titles;
  });
  return best;
}

function extractRankedTitles($: cheerio.CheerioAPI, container: cheerio.Cheerio<AnyNode>): string[] {
  const rows: { title: string; count: number }[] = [];
  const items = container.is("table") ? container.find("tr") : container.children("li");

  items.each((_, el) => {
    const cells = $(el).find("td");
    let title = "";
    let count = NaN;
    if (cells.length >= 2) {
      // find the numeric cell and the longest text cell
      cells.each((__, c) => {
        const t = $(c).text().replace(/\s+/g, " ").trim();
        if (/^\d+[.,]?\d*$/.test(t)) count = parseFloat(t.replace(",", "."));
        else if (t.length > title.length) title = t;
      });
    } else {
      // list item like "Trackname (23 stemmen)", "Trackname (1 stem)", "Trackname (42)"
      const t = $(el).text().replace(/\s+/g, " ").trim();
      const m =
        t.match(/^(.+?)\s*[([](\d+)[^)\]]*[)\]]\s*$/) ?? t.match(/^(.+?)\s+(\d+)$/);
      if (m) {
        title = m[1].trim();
        count = parseInt(m[2], 10);
      }
    }
    title = title.replace(/^\d{1,3}[.)]\s*/, "").trim();
    if (title && title.length <= 100 && !Number.isNaN(count)) rows.push({ title, count });
  });

  rows.sort((a, b) => b.count - a.count);
  return rows.map((r) => r.title);
}
