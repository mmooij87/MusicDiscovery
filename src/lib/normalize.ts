/**
 * Normalization + fuzzy matching helpers used to dedupe tracks and to score
 * how well a Spotify/iTunes/Deezer search result matches a scanned candidate.
 */

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[''`´]/g, "'")
    .replace(/\((feat|ft|featuring)[^)]*\)/g, " ")
    .replace(/\b(feat|ft|featuring)\.?\s+.*$/g, " ")
    .replace(/\./g, "") // "D.C." -> "dc", not "d c"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normKey(artist: string, title: string): string {
  return `${normalize(artist)}|${normalize(title)}`;
}

/** Dice coefficient on word bigrams; 0..1. Good enough for title matching. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bigrams = (s: string) => {
    const grams = new Map<string, number>();
    const padded = ` ${s} `;
    for (let i = 0; i < padded.length - 1; i++) {
      const g = padded.slice(i, i + 2);
      grams.set(g, (grams.get(g) ?? 0) + 1);
    }
    return grams;
  };
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of ga) {
    overlap += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return (2 * overlap) / total;
}

/** Combined score for a candidate (artist, title) against a catalog result. */
export function matchScore(
  candidate: { artist: string; title: string },
  result: { artist: string; title: string },
): number {
  return 0.5 * similarity(candidate.artist, result.artist) + 0.5 * similarity(candidate.title, result.title);
}
