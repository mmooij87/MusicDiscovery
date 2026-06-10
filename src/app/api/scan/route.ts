import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/scanner/scan";

export const dynamic = "force-dynamic";
// scraping + catalog matching can take a few minutes on a big scan
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const reprocess = req.nextUrl.searchParams.get("reprocess") ?? undefined;
    const summary = await runScan({ reprocess });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const POST = GET;
