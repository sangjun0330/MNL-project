import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function toLimit(v: string | null): number {
  const n = Number(v ?? "60");
  if (!Number.isFinite(n)) return 60;
  return Math.max(1, Math.min(200, Math.round(n)));
}

function toOffset(v: string | null): number {
  const n = Number(v ?? "0");
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function maskId(value: string): string {
  const s = String(value ?? "").trim();
  if (!s || s.length <= 8) return s.slice(0, 2) + "***";
  return s.slice(0, 8) + "…";
}

function maskIp(value: string): string {
  const s = String(value ?? "").trim();
  if (!s || s === "unknown") return "unknown";
  if (s.includes(".")) {
    const parts = s.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  }
  if (s.includes(":")) {
    const parts = s.split(":").filter(Boolean);
    if (parts.length >= 2) return `${parts.slice(0, 2).join(":")}::*`;
  }
  return s.slice(0, 6) + "…";
}

export async function GET(req: Request) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const url = new URL(req.url);
  const action = url.searchParams.get("action")?.trim() ?? "";
  const userId = url.searchParams.get("userId")?.trim() ?? "";
  const limit = toLimit(url.searchParams.get("limit"));
  const offset = toOffset(url.searchParams.get("offset"));

  const admin = getSupabaseAdmin();

  try {
    let query = (admin as any)
      .from("rnest_social_action_attempts")
      .select("id, action, actor_user_id, actor_ip, success, detail, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) {
      query = query.eq("action", action);
    }
    if (userId) {
      query = query.eq("actor_user_id", userId);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const logs = ((data as any[]) ?? []).map((row) => ({
      id: Number(row.id),
      action: String(row.action ?? ""),
      actorUserId: maskId(String(row.actor_user_id ?? "")),
      actorIp: maskIp(String(row.actor_ip ?? "")),
      success: Boolean(row.success),
      detail: row.detail ?? null,
      createdAt: String(row.created_at ?? ""),
    }));

    return NextResponse.json({ ok: true, data: { logs, total: count ?? 0 } });
  } catch {
    return bad(500, "failed_to_list_security_logs");
  }
}
