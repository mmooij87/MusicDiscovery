import { describe, expect, it } from "vitest";
import { seededShuffle } from "@/lib/shuffle";

describe("seededShuffle", () => {
  const items = Array.from({ length: 50 }, (_, i) => i);

  it("is deterministic for the same seed", () => {
    expect(seededShuffle(items, 20260610)).toEqual(seededShuffle(items, 20260610));
  });

  it("produces a different order for a different seed", () => {
    expect(seededShuffle(items, 20260610)).not.toEqual(seededShuffle(items, 20260611));
  });

  it("keeps all items and does not mutate the input", () => {
    const input = [...items];
    const out = seededShuffle(input, 7);
    expect(input).toEqual(items);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });
});
