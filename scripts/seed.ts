/**
 * Creates the schema (if missing) and registers the sources from
 * src/db/defaultSources.ts. Safe to run repeatedly — existing sources
 * (matched by name) are left untouched.
 *
 *   npm run seed
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { ensureDatabase } from "../src/db/bootstrap";
import { DEFAULT_SOURCES } from "../src/db/defaultSources";

async function main() {
  await ensureDatabase();
  for (const source of DEFAULT_SOURCES) {
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
