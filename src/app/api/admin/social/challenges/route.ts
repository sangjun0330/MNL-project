import { jsonNoStore } from "@/lib/server/requestSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { listSocialAdminChallenges, requireSocialAdmin } from "@/lib/server/socialAdmin";

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
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const data = await listSocialAdminChallenges({
      admin: getSupabaseAdmin(),
      query: q,
      limit,
    });
    return jsonNoStore({ ok: true, data: { challenges: data } });
  } catch (error: any) {
    console.error("[AdminSocialChallenges/GET] err=%s", String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_load_social_challenges" }, { status: 500 });
  }
}
