/**
 * Runs a full scan of all enabled sources from the command line:
 *
 *   npm run scan
 *
 * The same pipeline is exposed as GET /api/scan for Vercel Cron.
 */
import { runScan } from "../src/scanner/scan";

runScan()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    const warnings = summary.sources.flatMap((s) => s.warnings.map((w) => `[${s.name}] ${w}`));
    if (warnings.length) {
      console.log("\nWarnings:");
      for (const w of warnings) console.log(`  - ${w}`);
    }
    console.log(`\n${summary.newTracks} new tracks (${summary.withPreview} with preview).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Scan failed:", err);
    process.exit(1);
  });
