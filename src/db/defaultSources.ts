import type { schema } from "./index";

/** The music sources this app watches. Edit here, then run `npm run seed`
 *  locally or simply redeploy — new deployments seed automatically. */
export const DEFAULT_SOURCES: (typeof schema.sources.$inferInsert)[] = [
  {
    type: "podcast",
    name: "St. Paul's Boutique",
    url: "https://www.tivolivredenburg.nl/studio/podcast/st-pauls-boutique/",
    // RSS feed is resolved via Apple's podcast lookup; set config.feedUrl to
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
