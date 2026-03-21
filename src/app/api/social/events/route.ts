import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// GET /api/social/events — 최근 50건 (7일 이내), unread 먼저
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: true, data: { events: [], unreadCount: 0 } });

  const admin = getSupabaseAdmin();

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await (admin as any)
      .from("rnest_social_events")
      .select("id, type, actor_id, entity_id, payload, read_at, created_at")
      .eq("recipient_id", userId)
      .gte("created_at", since)
      .order("read_at", { ascending: true, nullsFirst: true }) // unread 먼저
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const events = (rows ?? []).map((r: any) => ({
      id: r.id,
      type: r.type,
      actorId: r.actor_id ?? null,
      entityId: r.entity_id ?? null,
      payload: r.payload ?? {},
      readAt: r.read_at ?? null,
      createdAt: r.created_at,
    }));

    const unreadCount = events.filter((e: { readAt: string | null }) => !e.readAt).length;

    return jsonNoStore({ ok: true, data: { events, unreadCount } });
  } catch (err: any) {
    console.error("[SocialEvents/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_events" }, { status: 500 });
  }
}
