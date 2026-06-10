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
  it("reads the 'Favoriete tracks' list with (N stemmen) counts, sorted by votes", () => {
    const tracks = parsePopularTracks(statsHtml);
    expect(tracks.slice(0, 3)).toEqual(["Flood", "Free", "Young"]);
    expect(tracks).not.toContain("5 sterren");
    // tab navigation links must not be read as tracks
    expect(tracks).not.toContain("informatie");
  });

  it("also handles a (title, count) table layout as fallback", () => {
    const html = `<html><body>
      <h3>Populairste tracks</h3>
      <table>
        <tr><td>Naraka</td><td>18</td></tr>
        <tr><td>Prophecy at 1420 MHz</td><td>23</td></tr>
      </table>
    </body></html>`;
    expect(parsePopularTracks(html)).toEqual(["Prophecy at 1420 MHz", "Naraka"]);
  });
});
