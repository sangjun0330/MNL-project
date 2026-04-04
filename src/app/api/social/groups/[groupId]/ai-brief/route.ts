import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { userHasCompletedServiceConsent } from "@/lib/server/serviceConsentStore";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { parseSocialGroupId } from "@/lib/server/socialGroups";
import { getCurrentGroupAIBrief } from "@/lib/server/socialGroupAIBrief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  let groupId = 0;
  try {
    const userId = await readUserIdFromRequest(req);
    if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });
    if (!(await userHasCompletedServiceConsent(userId))) {
      return jsonNoStore({ ok: false, error: "consent_required" }, { status: 403 });
    }

    const { groupId: rawGroupId } = await params;
    groupId = parseSocialGroupId(rawGroupId) ?? 0;
    if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const response = await getCurrentGroupAIBrief({
      admin,
      groupId,
      userId,
    });
    return jsonNoStore({ ok: true, data: response });
  } catch (error: any) {
    const code = String(error?.code ?? error?.message ?? "");
    if (code === "not_group_member") {
      return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });
    }
    if (code === "group_not_found") {
      return jsonNoStore({ ok: false, error: "group_not_found" }, { status: 404 });
    }
    console.error("[SocialGroupAIBrief/GET] group=%d err=%s", groupId, String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_get_group_ai_brief" }, { status: 500 });
  }
}
