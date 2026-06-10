import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureDatabase } from "@/db/bootstrap";
import { mapLimit, sleep } from "@/lib/http";
import { normKey } from "@/lib/normalize";
import { findPreview } from "@/lib/preview";
import { findOnSpotify } from "@/lib/spotify";
import { musicmeterAdapter } from "./musicmeter";
import { podcastAdapter } from "./podcast";
import type { Candidate, SourceAdapter, SourceRecord } from "./types";

const adapters: Record<SourceRecord["type"], SourceAdapter> = {
  podcast: podcastAdapter,
  musicmeter_rotation: musicmeterAdapter,
};

export interface ScanSummary {
  sources: {
    name: string;
    candidates: number;
    newTracks: number;
    /** candidates that matched neither Spotify nor a preview and were skipped */
    dropped: string[];
    warnings: string[];
    error?: string;
  }[];
  newTracks: number;
  withPreview: number;
  withSpotify: number;
  /** previously unmatched tracks that gained a Spotify link/preview this scan */
  enriched: number;
}

export interface ScanOptions {
  /** Forget which episodes/albums were already processed for this source
   *  type ("podcast" | "musicmeter_rotation" | "all"), so they re-scan. */
  reprocess?: string;
}

export async function runScan(options: ScanOptions = {}): Promise<ScanSummary> {
  await ensureDatabase();
  if (options.reprocess) {
    const types =
      options.reprocess === "all"
        ? (["podcast", "musicmeter_rotation"] as const)
        : ([options.reprocess] as const);
    const affected = await db.query.sources.findMany({
      where: inArray(schema.sources.type, types as unknown as ("podcast" | "musicmeter_rotation")[]),
      columns: { id: true },
    });
    if (affected.length > 0) {
      await db.delete(schema.sourceItems).where(
        inArray(
          schema.sourceItems.sourceId,
          affected.map((s) => s.id),
        ),
      );
    }
  }
  const [scanRow] = await db.insert(schema.scans).values({}).returning();
  const summary: ScanSummary = {
    sources: [],
    newTracks: 0,
    withPreview: 0,
    withSpotify: 0,
    enriched: 0,
  };

  try {
    const sources = await db.query.sources.findMany({ where: eq(schema.sources.enabled, true) });

    for (const source of sources) {
      const sourceSummary: ScanSummary["sources"][number] = {
        name: source.name,
        candidates: 0,
        newTracks: 0,
        dropped: [],
        warnings: [],
      };
      summary.sources.push(sourceSummary);

      try {
        const adapter = adapters[source.type];
        const processedRows = await db.query.sourceItems.findMany({
          where: eq(schema.sourceItems.sourceId, source.id),
          columns: { externalId: true },
        });
        const alreadyProcessed = new Set(processedRows.map((r) => r.externalId));

        const { candidates, processedItems, warnings } = await adapter.scan(
          { ...source, config: source.config ?? {} },
          alreadyProcessed,
        );
        sourceSummary.warnings = warnings;
        sourceSummary.candidates = candidates.length;

        const fresh = dedupeCandidates(candidates);
        const existing = fresh.length
          ? await db.query.tracks.findMany({
              where: inArray(
                schema.tracks.normKey,
                fresh.map((c) => normKey(c.artist, c.title)),
              ),
              columns: { normKey: true },
            })
          : [];
        const existingKeys = new Set(existing.map((t) => t.normKey));
        const newCandidates = fresh.filter((c) => !existingKeys.has(normKey(c.artist, c.title)));

        // Musicmeter candidates are precise (a named track of a charting
        // album), so keep them even before Spotify/iTunes know the song —
        // they get enriched on later scans. Podcast candidates come from
        // heuristic text parsing, so unmatched ones are likely noise.
        const keepUnmatched = source.type === "musicmeter_rotation";

        await mapLimit(newCandidates, 3, async (candidate) => {
          const inserted = await resolveAndStore(candidate, source.id, keepUnmatched);
          if (inserted) {
            sourceSummary.newTracks++;
            summary.newTracks++;
            if (inserted.previewUrl) summary.withPreview++;
            if (inserted.spotifyUrl) summary.withSpotify++;
          } else {
            sourceSummary.dropped.push(`${candidate.artist} - ${candidate.title}`);
          }
          await sleep(150); // stay polite to the catalog APIs
        });

        for (const item of processedItems) {
          await db
            .insert(schema.sourceItems)
            .values({ sourceId: source.id, externalId: item.externalId, title: item.title })
            .onConflictDoNothing();
        }
      } catch (err) {
        sourceSummary.error = err instanceof Error ? err.message : String(err);
      }
    }

    summary.enriched = await enrichUnmatchedTracks();

    await db
      .update(schema.scans)
      .set({
        finishedAt: new Date().toISOString(),
        status: summary.sources.some((s) => s.error) ? "error" : "ok",
        summary: summary as unknown as Record<string, unknown>,
      })
      .where(eq(schema.scans.id, scanRow.id));
    return summary;
  } catch (err) {
    await db
      .update(schema.scans)
      .set({
        finishedAt: new Date().toISOString(),
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(schema.scans.id, scanRow.id));
    throw err;
  }
}

/**
 * Tracks stored without a Spotify match or preview (fresh releases the
 * catalogs didn't know yet) get another lookup on every scan for 45 days.
 */
async function enrichUnmatchedTracks(): Promise<number> {
  const cutoff = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const stale = await db.query.tracks.findMany({
    where: and(
      isNull(schema.tracks.spotifyId),
      isNull(schema.tracks.previewUrl),
      isNull(schema.tracks.hiddenAt),
      gt(schema.tracks.createdAt, cutoff),
    ),
    limit: 25,
  });

  let enriched = 0;
  for (const track of stale) {
    const spotify = await findOnSpotify(track.artist, track.title).catch(() => null);
    const artist = spotify?.artist ?? track.artist;
    const title = spotify?.title ?? track.title;
    const preview = await findPreview(artist, title).catch(() => null);
    if (!spotify && !preview) continue;

    await db
      .update(schema.tracks)
      .set({
        artist,
        title,
        album: spotify?.album ?? track.album,
        spotifyId: spotify?.spotifyId ?? null,
        spotifyUrl: spotify?.spotifyUrl ?? null,
        artworkUrl: spotify?.artworkUrl ?? preview?.artworkUrl ?? null,
        previewUrl: preview?.previewUrl ?? null,
        previewSource: preview?.previewSource ?? null,
      })
      .where(eq(schema.tracks.id, track.id));
    enriched++;
    await sleep(150);
  }
  return enriched;
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = normKey(c.artist, c.title);
    if (!key.replace("|", "").trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolveAndStore(candidate: Candidate, sourceId: number, keepUnmatched = false) {
  const spotify = await findOnSpotify(candidate.artist, candidate.title).catch(() => null);
  // prefer Spotify's canonical spelling once matched
  const artist = spotify?.artist ?? candidate.artist;
  const title = spotify?.title ?? candidate.title;
  const preview = await findPreview(artist, title).catch(() => null);

  // Without either a Spotify match or a preview the card would be dead
  // weight in the feed, so skip those candidates — unless the source is
  // trusted (keepUnmatched): brand-new releases reach the catalogs days
  // later and get filled in by enrichUnmatchedTracks on a future scan.
  if (!spotify && !preview && !keepUnmatched) return null;

  const [track] = await db
    .insert(schema.tracks)
    .values({
      artist,
      title,
      normKey: normKey(candidate.artist, candidate.title),
      album: spotify?.album ?? null,
      spotifyId: spotify?.spotifyId ?? null,
      spotifyUrl: spotify?.spotifyUrl ?? null,
      artworkUrl: spotify?.artworkUrl ?? preview?.artworkUrl ?? null,
      previewUrl: preview?.previewUrl ?? null,
      previewSource: preview?.previewSource ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!track) return null;

  const dupDiscovery = await db.query.discoveries.findFirst({
    where: and(eq(schema.discoveries.trackId, track.id), eq(schema.discoveries.sourceId, sourceId)),
  });
  if (!dupDiscovery) {
    await db.insert(schema.discoveries).values({
      trackId: track.id,
      sourceId,
      context: candidate.context,
    });
  }
  return track;
}
