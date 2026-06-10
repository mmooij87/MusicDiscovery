import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePopularTracks, parseRotationList, parseStatsTitle } from "@/scanner/musicmeter";

const rotationHtml = readFileSync(join(__dirname, "fixtures/musicmeter-rotation.html"), "utf8");
const statsHtml = readFileSync(join(__dirname, "fixtures/musicmeter-stats.html"), "utf8");

describe("parseRotationList", () => {
  it("finds albums with ids, artists and titles in page order", () => {
    const albums = parseRotationList(rotationHtml);
    expect(albums.length).toBeGreaterThanOrEqual(4);
    expect(albums[0]).toMatchObject({
      position: 1,
      albumId: "923430",
      artist: "Bruce Springsteen",
      album: "Tracks II: The Lost Albums",
    });
    expect(albums[1].albumId).toBe("931001");
  });

  it("returns nothing on a page without album links", () => {
    expect(parseRotationList("<html><body><p>bot wall</p></body></html>")).toEqual([]);
  });
});

describe("parseStatsTitle", () => {
  it("reads artist and album from the page title", () => {
    expect(parseStatsTitle(statsHtml)).toEqual({ artist: "Little Simz", album: "Lotus" });
  });
});

describe("parsePopularTracks", () => {
  it("returns tracks sorted by popularity, not the ratings table", () => {
    const tracks = parsePopularTracks(statsHtml);
    expect(tracks.slice(0, 3)).toEqual(["Flood", "Free", "Young"]);
    expect(tracks).not.toContain("5 sterren");
  });
});
