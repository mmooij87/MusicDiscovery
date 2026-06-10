import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  candidateEpisodePages,
  extractTracklist,
  extractTracklistFromPage,
  parseFeedItems,
} from "@/scanner/podcast";

const feedXml = readFileSync(join(__dirname, "fixtures/podcast-feed.xml"), "utf8");
const episodeHtml = readFileSync(join(__dirname, "fixtures/tivoli-episode.html"), "utf8");

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

describe("extractTracklistFromPage", () => {
  it("finds the tracklist on an episode webpage and ignores nav/footer", () => {
    const tracks = extractTracklistFromPage(episodeHtml);
    expect(tracks).toEqual([
      { artist: "Blood Orange", title: "The Field" },
      { artist: "Nina Simone", title: "I Wish I Knew How It Would Feel to Be Free" },
      { artist: "Radio Z", title: "Zout" },
      { artist: "Gary Numan", title: "Cars" },
      { artist: "Aldous Harding", title: "Fever" },
    ]);
  });

  it("returns nothing for a page without a track cluster", () => {
    const html = "<main><p>Agenda - alle concerten</p><p>Hello there.</p></main>";
    expect(extractTracklistFromPage(html)).toEqual([]);
  });
});

describe("candidateEpisodePages", () => {
  const index = [
    { href: "https://site.nl/podcast/280-dermot-henry/", text: "#280: Dermot Henry, Ennio Morricone" },
    { href: "https://site.nl/podcast/281-blood-orange/", text: "#281: Blood Orange, Nina Simone, Radio Z & Gary Numan" },
  ];

  it("picks the matching episode page by number, then the RSS link", () => {
    const urls = candidateEpisodePages(
      {
        title: "#281: Blood Orange, Nina Simone, Radio Z & Gary Numan",
        link: "https://tivolivredenburg.podbean.com/e/281",
      },
      index,
    );
    expect(urls[0]).toBe("https://site.nl/podcast/281-blood-orange/");
    expect(urls[1]).toBe("https://tivolivredenburg.podbean.com/e/281");
  });

  it("falls back to the RSS link when the index has no match", () => {
    const urls = candidateEpisodePages({ title: "Bonus: interview", link: "https://x.nl/e/9" }, []);
    expect(urls).toEqual(["https://x.nl/e/9"]);
  });
});
