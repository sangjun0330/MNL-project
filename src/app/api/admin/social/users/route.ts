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
  const suspended = url.searchParams.get("suspended");
  const limit = toLimit(url.searchParams.get("limit"));
  const offset = toOffset(url.searchParams.get("offset"));

  const admin = getSupabaseAdmin();

  try {
    let query = (admin as any)
      .from("rnest_social_profiles")
      .select(
        "user_id, nickname, handle, display_name, avatar_emoji, account_visibility, is_suspended, suspended_at, suspended_by, suspension_reason, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      query = query.or(
        `nickname.ilike.%${q}%,handle.ilike.%${q}%,display_name.ilike.%${q}%`,
      );
    }
    if (suspended === "true") {
      query = query.eq("is_suspended", true);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const users = ((data as any[]) ?? []).map((row) => ({
      userId: String(row.user_id),
      nickname: String(row.nickname ?? ""),
      handle: String(row.handle ?? ""),
      displayName: String(row.display_name ?? ""),
      avatarEmoji: String(row.avatar_emoji ?? "👤"),
      accountVisibility: String(row.account_visibility ?? "public"),
      isSuspended: Boolean(row.is_suspended),
      suspendedAt: row.suspended_at ?? null,
      suspendedBy: row.suspended_by ?? null,
      suspensionReason: row.suspension_reason ?? null,
      createdAt: String(row.created_at ?? ""),
    }));

    return NextResponse.json({ ok: true, data: { users, total: count ?? 0 } });
  } catch {
    return bad(500, "failed_to_list_social_users");
  }
}
