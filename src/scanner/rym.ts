import * as cheerio from "cheerio";
import { fetchText } from "@/lib/http";
import { normKey } from "@/lib/normalize";
import type { AdapterResult, SourceAdapter, SourceRecord } from "./types";

/**
 * RateYourMusic chart adapter: takes the top N songs from a chart page like
 * https://rateyourmusic.com/charts/top/song/2026/. A "{year}" placeholder in
 * the source URL is replaced with the current year, so the source keeps
 * following "this year's top songs" forever.
 *
 * RYM has no API and is protective of its pages; parsing is layered and a
 * failure surfaces a warning with an HTML snippet so the parser can be fixed.
 */

export const rymChartAdapter: SourceAdapter = {
  async scan(source: SourceRecord, alreadyProcessed: Set<string>): Promise<AdapterResult> {
    const result: AdapterResult = { candidates: [], processedItems: [], warnings: [] };
    const topSongs = (source.config.topSongs as number) ?? 20;
    const url = source.url.replace("{year}", String(new Date().getFullYear()));

    const html = await fetchText(url);
    const entries = parseRymChart(html).slice(0, topSongs);
    if (entries.length === 0) {
      result.warnings.push(
        `RYM chart parser found no songs at ${url}. HTML starts with: ${html.slice(0, 300)}`,
      );
      return result;
    }

    for (const entry of entries) {
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
