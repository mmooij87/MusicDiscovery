import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { ensureDatabase } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

/** GET /api/scans?secret=… — the last 10 scan runs, newest first. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given =
    req.nextUrl.searchParams.get("secret") ??
    req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (secret && given !== secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureDatabase();
  const scans = await db
    .select()
    .from(schema.scans)
    .orderBy(desc(schema.scans.id))
    .limit(10);

  return NextResponse.json({
    now: new Date().toISOString(),
    scans: scans.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      status: s.status,
      error: s.error,
      summary: s.summary,
    })),
  });
}
