/**
 * Deterministic shuffle (mulberry32 + Fisher-Yates). Seeding with today's
 * date keeps the feed order stable while you scroll and refresh during the
 * day, but deals a fresh mix every morning.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Numeric seed for today, e.g. 20260610. */
export function todaySeed(): number {
  return Number(new Date().toISOString().slice(0, 10).replaceAll("-", ""));
}
