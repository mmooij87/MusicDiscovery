import { sql } from "drizzle-orm";
import { db, schema } from "./index";
import { DEFAULT_SOURCES } from "./defaultSources";

/**
 * Creates the schema and seeds the default sources when they're missing, so a
 * fresh deployment works straight from the browser — no `db:push`/`seed`
 * terminal steps needed. Statements are idempotent; existing data is never
 * touched. Mirrors what `drizzle-kit push` generates from schema.ts.
 */

const DDL = [
  `CREATE TABLE IF NOT EXISTS \`sources\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`type\` text NOT NULL,
    \`name\` text NOT NULL,
    \`url\` text NOT NULL,
    \`config\` text DEFAULT '{}',
    \`enabled\` integer DEFAULT true NOT NULL,
    \`created_at\` text DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS \`source_items\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`source_id\` integer NOT NULL,
    \`external_id\` text NOT NULL,
    \`title\` text,
    \`processed_at\` text DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (\`source_id\`) REFERENCES \`sources\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`source_items_unique\` ON \`source_items\` (\`source_id\`,\`external_id\`)`,
  `CREATE TABLE IF NOT EXISTS \`tracks\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`artist\` text NOT NULL,
    \`title\` text NOT NULL,
    \`norm_key\` text NOT NULL,
    \`album\` text,
    \`spotify_id\` text,
    \`spotify_url\` text,
    \`artwork_url\` text,
    \`preview_url\` text,
    \`preview_source\` text,
    \`created_at\` text DEFAULT (datetime('now')) NOT NULL,
    \`seen_at\` text,
    \`liked_at\` text,
    \`hidden_at\` text
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`tracks_norm_key_unique\` ON \`tracks\` (\`norm_key\`)`,
  `CREATE TABLE IF NOT EXISTS \`discoveries\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`track_id\` integer NOT NULL,
    \`source_id\` integer NOT NULL,
    \`context\` text,
    \`discovered_at\` text DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (\`track_id\`) REFERENCES \`tracks\`(\`id\`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (\`source_id\`) REFERENCES \`sources\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS \`scans\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`started_at\` text DEFAULT (datetime('now')) NOT NULL,
    \`finished_at\` text,
    \`status\` text DEFAULT 'running' NOT NULL,
    \`summary\` text,
    \`error\` text
  )`,
];

let bootstrapped: Promise<void> | null = null;

export function ensureDatabase(): Promise<void> {
  bootstrapped ??= bootstrap();
  return bootstrapped;
}

async function bootstrap(): Promise<void> {
  for (const statement of DDL) {
    await db.run(sql.raw(statement));
  }
  const existing = await db.select({ id: schema.sources.id }).from(schema.sources).limit(1);
  if (existing.length === 0) {
    await db.insert(schema.sources).values(DEFAULT_SOURCES);
  }
}
