import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["podcast", "musicmeter_rotation", "rym_chart"] }).notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// Items (podcast episodes, chart albums) we already processed, so a daily
// scan only looks at what's new since the previous run.
export const sourceItems = sqliteTable(
  "source_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    externalId: text("external_id").notNull(),
    title: text("title"),
    processedAt: text("processed_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("source_items_unique").on(t.sourceId, t.externalId)],
);

export const tracks = sqliteTable(
  "tracks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    artist: text("artist").notNull(),
    title: text("title").notNull(),
    // normalized "artist|title" used for dedup across sources and scans
    normKey: text("norm_key").notNull(),
    album: text("album"),
    spotifyId: text("spotify_id"),
    spotifyUrl: text("spotify_url"),
    artworkUrl: text("artwork_url"),
    previewUrl: text("preview_url"),
    previewSource: text("preview_source", { enum: ["itunes", "deezer"] }),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    seenAt: text("seen_at"),
    likedAt: text("liked_at"),
    hiddenAt: text("hidden_at"),
  },
  (t) => [uniqueIndex("tracks_norm_key_unique").on(t.normKey)],
);

export const discoveries = sqliteTable("discoveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trackId: integer("track_id")
    .notNull()
    .references(() => tracks.id),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sources.id),
  // human-readable origin, e.g. "Episode #312" or "Rotatielijst #4 — <album>"
  context: text("context"),
  discoveredAt: text("discovered_at").notNull().default(sql`(datetime('now'))`),
});

export const scans = sqliteTable("scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull().default(sql`(datetime('now'))`),
  finishedAt: text("finished_at"),
  status: text("status", { enum: ["running", "ok", "error"] }).notNull().default("running"),
  summary: text("summary", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
});
