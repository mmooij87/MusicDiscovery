// Inserts a few fake tracks so the feed UI can be previewed without API keys.
import { db, schema } from "../src/db";
import { normKey } from "../src/lib/normalize";

const demo = [
  { artist: "Little Simz", title: "Flood", album: "Lotus" },
  { artist: "Fontaines D.C.", title: "Starburster", album: "Romance" },
  { artist: "Mdou Moctar", title: "Funeral for Justice", album: "Funeral for Justice" },
];

async function main() {
  const [source] = await db.select().from(schema.sources).limit(1);
  for (const d of demo) {
    const [track] = await db
      .insert(schema.tracks)
      .values({ ...d, normKey: normKey(d.artist, d.title), spotifyUrl: null, artworkUrl: null, previewUrl: null })
      .onConflictDoNothing()
      .returning();
    if (track && source) {
      await db.insert(schema.discoveries).values({ trackId: track.id, sourceId: source.id, context: "Demo data" });
    }
  }
  console.log("demo data inserted");
}
main().then(() => process.exit(0));
