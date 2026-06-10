import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRymChart } from "@/scanner/rym";

const chartHtml = readFileSync(join(__dirname, "fixtures/rym-chart.html"), "utf8");

describe("parseRymChart", () => {
  it("parses positions, artists and titles from a chart page", () => {
    const entries = parseRymChart(chartHtml);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      position: 1,
      artist: "Quantum Choir",
      title: "Prophecy at 1420 MHz",
      id: "page_charts_section_charts_item_song_1001",
    });
  });

  it("joins multiple credited artists", () => {
    expect(parseRymChart(chartHtml)[1].artist).toBe("The Avalanches & Jamie xx");
  });

  it("strips quotes around song titles", () => {
    expect(parseRymChart(chartHtml)[2].title).toBe("Starburster");
  });

  it("returns nothing for a page without chart items (e.g. a bot wall)", () => {
    expect(parseRymChart("<html><body>Checking your browser…</body></html>")).toEqual([]);
  });
});
