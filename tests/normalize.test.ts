import { describe, expect, it } from "vitest";
import { matchScore, normKey, normalize, similarity } from "@/lib/normalize";

describe("normalize", () => {
  it("strips case, punctuation, diacritics and feat. credits", () => {
    expect(normalize("Beyoncé — HEATED (feat. Jay-Z)")).toBe("beyonce heated");
    expect(normalize("St. Paul's Boutique")).toBe("st paul s boutique");
  });
});

describe("normKey", () => {
  it("is stable across formatting differences", () => {
    expect(normKey("Fontaines D.C.", "Starburster!")).toBe(normKey("fontaines dc", "Starburster"));
  });
});

describe("similarity / matchScore", () => {
  it("scores identical strings 1 and unrelated strings low", () => {
    expect(similarity("Flood", "Flood")).toBe(1);
    expect(similarity("Flood", "Completely Different Song")).toBeLessThan(0.3);
  });

  it("tolerates remaster suffixes", () => {
    const score = matchScore(
      { artist: "Pulp", title: "Common People" },
      { artist: "Pulp", title: "Common People - 2011 Remaster" },
    );
    expect(score).toBeGreaterThan(0.7);
  });
});
