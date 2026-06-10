import { desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Feed, type FeedTrack } from "@/components/Feed";
import { spotifySearchUrl } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export default async function Home() {
  const rows = await db
    .select({
      id: schema.tracks.id,
      artist: schema.tracks.artist,
      title: schema.tracks.title,
      album: schema.tracks.album,
      artworkUrl: schema.tracks.artworkUrl,
      previewUrl: schema.tracks.previewUrl,
      spotifyUrl: schema.tracks.spotifyUrl,
      seenAt: schema.tracks.seenAt,
      likedAt: schema.tracks.likedAt,
      discoveredAt: sql<string>`max(${schema.discoveries.discoveredAt})`,
      context: sql<string | null>`max(${schema.discoveries.context})`,
      sourceName: sql<string | null>`max(${schema.sources.name})`,
    })
    .from(schema.tracks)
    .leftJoin(schema.discoveries, eq(schema.discoveries.trackId, schema.tracks.id))
    .leftJoin(schema.sources, eq(schema.sources.id, schema.discoveries.sourceId))
    .where(isNull(schema.tracks.hiddenAt))
    .groupBy(schema.tracks.id)
    .orderBy(
      // unseen tracks first, then newest discoveries
      sql`${schema.tracks.seenAt} is not null`,
      desc(sql`max(${schema.discoveries.discoveredAt})`),
      desc(schema.tracks.id),
    )
    .limit(100);

  const tracks: FeedTrack[] = rows.map((r) => ({
    id: r.id,
    artist: r.artist,
    title: r.title,
    album: r.album,
    artworkUrl: r.artworkUrl,
    previewUrl: r.previewUrl,
    spotifyUrl: r.spotifyUrl ?? spotifySearchUrl(r.artist, r.title),
    liked: r.likedAt != null,
    seen: r.seenAt != null,
    sourceName: r.sourceName,
    context: r.context,
    discoveredAt: r.discoveredAt?.slice(0, 10) ?? null,
  }));

  return <Feed tracks={tracks} />;
}
