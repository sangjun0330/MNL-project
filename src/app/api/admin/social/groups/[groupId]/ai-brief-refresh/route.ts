import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { requireSocialAdmin, runSocialAdminAIBriefGeneration } from "@/lib/server/socialAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const access = await requireSocialAdmin(req);
  if (!access.ok) {
    return jsonNoStore({ ok: false, error: access.error }, { status: access.status });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {}

  try {
    const { groupId: rawGroupId } = await params;
    const groupId = Number.parseInt(rawGroupId, 10);
    if (!Number.isFinite(groupId) || groupId <= 0) {
      return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });
    }
    const result = await runSocialAdminAIBriefGeneration({
      admin: getSupabaseAdmin(),
      adminUserId: access.identity.userId,
      groupId,
      reason: body?.reason,
    });
    return jsonNoStore({ ok: true, data: result });
  } catch (error: any) {
    console.error("[AdminSocialGroupAIRefresh/POST] err=%s", String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_refresh_group_ai_brief" }, { status: 500 });
  }
}
