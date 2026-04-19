import { jsonNoStore } from "@/lib/server/requestSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { listSocialAdminContent, requireSocialAdmin } from "@/lib/server/socialAdmin";

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
    const kind = url.searchParams.get("kind") ?? "all";
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "45", 10);
    const data = await listSocialAdminContent({
      admin: getSupabaseAdmin(),
      query: q,
      kind: kind as any,
      limit,
    });
    return jsonNoStore({ ok: true, data: { items: data } });
  } catch (error: any) {
    console.error("[AdminSocialContent/GET] err=%s", String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_load_social_content" }, { status: 500 });
  }
}
