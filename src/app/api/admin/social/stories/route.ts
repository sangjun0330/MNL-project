import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function toLimit(v: string | null): number {
  const n = Number(v ?? "40");
  if (!Number.isFinite(n)) return 40;
  return Math.max(1, Math.min(100, Math.round(n)));
}

function toOffset(v: string | null): number {
  const n = Number(v ?? "0");
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export async function GET(req: Request) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const url = new URL(req.url);
  const limit = toLimit(url.searchParams.get("limit"));
  const offset = toOffset(url.searchParams.get("offset"));

  const admin = getSupabaseAdmin();

  try {
    const { data, count, error } = await (admin as any)
      .from("rnest_social_stories")
      .select(
        "id, author_user_id, content_type, text, expires_at, view_count, created_at",
        { count: "exact" },
      )
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const rows = (data as any[]) ?? [];

    // 저자 프로필 배치 하이드레이션
    const authorIds = [...new Set(rows.map((r) => String(r.author_user_id)))];
    const profileMap: Record<string, { nickname: string; handle: string }> = {};

    if (authorIds.length > 0) {
      const { data: profiles } = await (admin as any)
        .from("rnest_social_profiles")
        .select("user_id, nickname, handle")
        .in("user_id", authorIds);

      for (const p of (profiles as any[]) ?? []) {
        profileMap[String(p.user_id)] = {
          nickname: String(p.nickname ?? ""),
          handle: String(p.handle ?? ""),
        };
      }
    }

    const stories = rows.map((row) => {
      const profile = profileMap[String(row.author_user_id)] ?? { nickname: "", handle: "" };
      const text = String(row.text ?? "");
      return {
        id: Number(row.id),
        authorUserId: String(row.author_user_id),
        authorNickname: profile.nickname,
        authorHandle: profile.handle,
        contentType: String(row.content_type ?? ""),
        textPreview: text.length > 60 ? text.slice(0, 60) + "…" : text,
        expiresAt: String(row.expires_at ?? ""),
        viewCount: Number(row.view_count ?? 0),
        createdAt: String(row.created_at ?? ""),
      };
    });

    return NextResponse.json({ ok: true, data: { stories, total: count ?? 0 } });
  } catch {
    return bad(500, "failed_to_list_social_stories");
  }
}
