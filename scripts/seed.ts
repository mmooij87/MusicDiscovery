/**
 * Seeds the configured music sources. Safe to run repeatedly — existing
 * sources (matched by name) are left untouched.
 *
 *   npm run seed
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";

const SOURCES: (typeof schema.sources.$inferInsert)[] = [
  {
    type: "podcast",
    name: "St. Paul's Boutique",
    url: "https://www.tivolivredenburg.nl/studio/podcast/st-pauls-boutique/",
    // Feed URL is resolved via Apple's podcast lookup; set config.feedUrl to
    // override with a direct RSS URL.
    config: { applePodcastId: 1809973533, maxEpisodesPerScan: 5 },
  },
  {
    type: "musicmeter_rotation",
    name: "Musicmeter Rotatielijst",
    url: "https://www.musicmeter.nl/list/rotation",
    config: { topAlbums: 10, tracksPerAlbum: 3 },
  },
];

async function main() {
  for (const source of SOURCES) {
    const existing = await db.query.sources.findFirst({
      where: eq(schema.sources.name, source.name),
    });
    if (existing) {
      console.log(`= ${source.name} (already present)`);
      continue;
    }
    await db.insert(schema.sources).values(source);
    console.log(`+ ${source.name}`);
  }
  console.log("Done.");
}

main().then(() => process.exit(0));
