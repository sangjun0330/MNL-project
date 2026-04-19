import { jsonNoStore } from "@/lib/server/requestSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { listSocialAdminUsers, requireSocialAdmin } from "@/lib/server/socialAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireSocialAdmin(req);
  if (!access.ok) {
    return jsonNoStore({ ok: false, error: access.error }, { status: access.status });
  }

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const state = url.searchParams.get("state") ?? "all";
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "60", 10);
    const data = await listSocialAdminUsers({
      admin: getSupabaseAdmin(),
      query: q,
      state: state as any,
      limit,
    });
    return jsonNoStore({ ok: true, data: { users: data } });
  } catch (error: any) {
    console.error("[AdminSocialUsers/GET] err=%s", String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_load_social_users" }, { status: 500 });
  }
}
