import { jsonNoStore } from "@/lib/server/requestSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { listSocialAdminOverview, requireSocialAdmin } from "@/lib/server/socialAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireSocialAdmin(req);
  if (!access.ok) {
    return jsonNoStore({ ok: false, error: access.error }, { status: access.status });
  }

  try {
    const data = await listSocialAdminOverview(getSupabaseAdmin());
    return jsonNoStore({ ok: true, data });
  } catch (error: any) {
    console.error("[AdminSocialOverview/GET] err=%s", String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_load_social_overview" }, { status: 500 });
  }
}
