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
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = toLimit(url.searchParams.get("limit"));
  const offset = toOffset(url.searchParams.get("offset"));

  const admin = getSupabaseAdmin();

  try {
    let query = (admin as any)
      .from("rnest_social_groups")
      .select("id, name, description, owner_user_id, max_members, join_mode, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const rows = (data as any[]) ?? [];

    // 멤버 수 배치 집계
    const groupIds = rows.map((r) => Number(r.id));
    const memberCountMap: Record<number, number> = {};

    if (groupIds.length > 0) {
      const { data: memberRows } = await (admin as any)
        .from("rnest_social_group_members")
        .select("group_id")
        .in("group_id", groupIds);

      for (const m of (memberRows as any[]) ?? []) {
        const gid = Number(m.group_id);
        memberCountMap[gid] = (memberCountMap[gid] ?? 0) + 1;
      }
    }

    // 오너 닉네임 배치 하이드레이션
    const ownerIds = [...new Set(rows.map((r) => String(r.owner_user_id)))];
    const ownerMap: Record<string, string> = {};

    if (ownerIds.length > 0) {
      const { data: profiles } = await (admin as any)
        .from("rnest_social_profiles")
        .select("user_id, nickname")
        .in("user_id", ownerIds);

      for (const p of (profiles as any[]) ?? []) {
        ownerMap[String(p.user_id)] = String(p.nickname ?? "");
      }
    }

    const groups = rows.map((row) => {
      const desc = String(row.description ?? "");
      return {
        id: Number(row.id),
        name: String(row.name ?? ""),
        descriptionPreview: desc.length > 60 ? desc.slice(0, 60) + "…" : desc,
        ownerUserId: String(row.owner_user_id),
        ownerNickname: ownerMap[String(row.owner_user_id)] ?? "",
        memberCount: memberCountMap[Number(row.id)] ?? 0,
        joinMode: String(row.join_mode ?? ""),
        createdAt: String(row.created_at ?? ""),
      };
    });

    return NextResponse.json({ ok: true, data: { groups, total: count ?? 0 } });
  } catch {
    return bad(500, "failed_to_list_social_groups");
  }
}
