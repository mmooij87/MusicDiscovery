import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/tracks/:id with { action: "seen" | "like" | "unlike" | "hide" }.
 * Single-user app, so no auth beyond the deployment itself.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const trackId = Number(id);
  if (!Number.isInteger(trackId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const now = new Date().toISOString();

  const patch =
    action === "seen"
      ? { seenAt: now }
      : action === "like"
        ? { likedAt: now }
        : action === "unlike"
          ? { likedAt: null }
          : action === "hide"
            ? { hiddenAt: now }
            : null;
  if (!patch) return NextResponse.json({ error: "invalid action" }, { status: 400 });

  await db.update(schema.tracks).set(patch).where(eq(schema.tracks.id, trackId));
  return NextResponse.json({ ok: true });
}
