import * as cheerio from "cheerio";
import { fetchJson, fetchText } from "@/lib/http";
import { normKey } from "@/lib/normalize";
import type { AdapterResult, SourceAdapter, SourceRecord } from "./types";

/**
 * RateYourMusic chart adapter: takes the top N songs from a chart page like
 * https://rateyourmusic.com/charts/top/song/2026/. A "{year}" placeholder in
 * the source URL is replaced with the current year, so the source keeps
 * following "this year's top songs" forever.
 *
 * RYM blocks datacenter traffic aggressively, so when the live page (and the
 * reader mirror) won't load, the adapter falls back to the latest Wayback
 * Machine snapshot — fine for a chart that shifts slowly.
 */

export const rymChartAdapter: SourceAdapter = {
  async scan(source: SourceRecord, alreadyProcessed: Set<string>): Promise<AdapterResult> {
    const result: AdapterResult = { candidates: [], processedItems: [], warnings: [] };
    const topSongs = (source.config.topSongs as number) ?? 20;
    const url = source.url.replace("{year}", String(new Date().getFullYear()));

    let html = "";
    let entries: RymEntry[] = [];
    try {
      html = await fetchText(url);
      entries = parseRymChart(html);
    } catch (err) {
      result.warnings.push(`Live fetch of ${url} failed: ${err}`);
    }

    if (entries.length === 0) {
      try {
        const snapshot = await fetchWaybackSnapshot(url);
        entries = parseRymChart(snapshot.html);
        if (entries.length > 0) {
          result.warnings.push(
            `Used Wayback Machine snapshot ${snapshot.timestamp} for ${url} (live page blocked).`,
          );
        } else {
          html = snapshot.html;
        }
      } catch (err) {
        result.warnings.push(`Wayback fallback for ${url} failed: ${err}`);
      }
    }

    if (entries.length === 0) {
      result.warnings.push(
        `RYM chart parser found no songs at ${url}. HTML starts with: ${html.slice(0, 300)}`,
      );
      return result;
    }

    for (const entry of entries.slice(0, topSongs)) {
      const externalId = entry.id ?? normKey(entry.artist, entry.title);
      if (alreadyProcessed.has(externalId)) continue;
      result.candidates.push({
        artist: entry.artist,
        title: entry.title,
        context: `RYM Top Songs #${entry.position}`,
        externalId,
        externalTitle: `${entry.artist} - ${entry.title}`,
      });
      result.processedItems.push({ externalId, title: `${entry.artist} - ${entry.title}` });
    }
    return result;
  },
};

export interface RymEntry {
  position: number;
  artist: string;
  title: string;
  id: string | null;
}

/** Latest Wayback Machine capture of a URL, served as the original HTML. */
async function fetchWaybackSnapshot(url: string): Promise<{ html: string; timestamp: string }> {
  let timestamp: string | null = null;

  // the CDX index is far more reliable than the availability API
  try {
    const rows = await fetchJson<string[][]>(
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&filter=statuscode:200&limit=-3`,
    );
    const last = rows.at(-1);
    if (last && /^\d{14}$/.test(last[1])) timestamp = last[1];
  } catch {
    /* fall through to the availability API */
  }
  if (!timestamp) {
    const availability = await fetchJson<{
      archived_snapshots?: { closest?: { timestamp?: string } };
    }>(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
    timestamp = availability.archived_snapshots?.closest?.timestamp ?? null;
  }
  if (!timestamp) throw new Error("no snapshot available");

  // the id_ flag serves the page as captured, without the Wayback toolbar
  const html = await fetchText(`https://web.archive.org/web/${timestamp}id_/${url}`);
  return { html, timestamp };
}

export function parseRymChart(html: string): RymEntry[] {
  const $ = cheerio.load(html);
  const entries: RymEntry[] = [];

  $(".page_charts_section_charts_item").each((_, el) => {
    const item = $(el);
    const title = clean(
      item
        .find(".page_charts_section_charts_item_title a, a.song, a.release")
        .first()
        .text(),
    );
    const artists = item
      .find(".page_charts_section_charts_item_credited_links_primary a.artist, a.artist")
      .map((__, a) => clean($(a).text()))
      .get()
      .filter(Boolean);
    if (!title || artists.length === 0) return;
    entries.push({
      position: entries.length + 1,
      artist: artists.join(" & "),
      title,
      id: item.attr("id") ?? null,
    });
  });

  return entries;
}

function clean(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^["'""'„]+|["'""']+$/g, "")
    .trim();
}
