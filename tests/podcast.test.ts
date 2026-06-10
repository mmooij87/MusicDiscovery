import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractTracklist, parseFeedItems } from "@/scanner/podcast";

const feedXml = readFileSync(join(__dirname, "fixtures/podcast-feed.xml"), "utf8");

describe("parseFeedItems", () => {
  it("parses episodes from RSS", () => {
    const items = parseFeedItems(feedXml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toContain("#312");
  });
});

describe("extractTracklist", () => {
  it("extracts tracks in mixed formats and skips prose/links", () => {
    const items = parseFeedItems(feedXml);
    const tracks = extractTracklist(items[0].description ?? "");

    expect(tracks).toContainEqual({ artist: "Little Simz", title: "Flood" });
    expect(tracks).toContainEqual({ artist: "Fontaines D.C.", title: "Starburster" });
    expect(tracks).toContainEqual({ artist: "Sault", title: "Glory" });
    expect(tracks).toContainEqual({ artist: "Mdou Moctar", title: "Funeral for Justice" });
    // timestamped lines
    expect(tracks).toContainEqual({ artist: "Arooj Aftab", title: "Raat Ki Rani" });
    expect(tracks).toContainEqual({ artist: "BADBADNOTGOOD", title: "Beside April" });

    // noise must not leak through
    const all = tracks.map((t) => `${t.artist} ${t.title}`).join(" ");
    expect(all).not.toMatch(/instagram|tivolivredenburg|abonneer|aflevering/i);
  });

  it("returns empty for episodes without a tracklist", () => {
    const items = parseFeedItems(feedXml);
    expect(extractTracklist(items[1].description ?? "")).toHaveLength(0);
  });

  it("keeps dashes inside titles", () => {
    const tracks = extractTracklist("<p>Yo La Tengo - Sinatra Drive - Breakdown</p>");
    expect(tracks).toEqual([{ artist: "Yo La Tengo", title: "Sinatra Drive - Breakdown" }]);
  });
});
