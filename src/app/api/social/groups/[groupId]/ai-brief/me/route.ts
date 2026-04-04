import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { userHasSocialGroupAIBriefConsent } from "@/lib/server/socialGroupAIBriefAccess";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { parseSocialGroupId } from "@/lib/server/socialGroups";
import {
  readGroupAIBriefViewerPrefs,
  saveGroupAIBriefViewerPrefs,
} from "@/lib/server/socialGroupAIBrief";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  let groupId = 0;
  try {
    const userId = await readUserIdFromRequest(req);
    if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

    const { groupId: rawGroupId } = await params;
    groupId = parseSocialGroupId(rawGroupId) ?? 0;
    if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });

    const admin = getSupabaseAdmin();
    if (!(await userHasSocialGroupAIBriefConsent(admin, userId))) {
      return jsonNoStore({ ok: false, error: "consent_required" }, { status: 403 });
    }
    const data = await readGroupAIBriefViewerPrefs({
      admin,
      groupId,
      userId,
    });
    return jsonNoStore({ ok: true, data });
  } catch (error: any) {
    const code = String(error?.code ?? error?.message ?? "");
    if (code === "not_group_member") {
      return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });
    }
    console.error("[SocialGroupAIBriefMe/GET] group=%d err=%s", groupId, String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_get_group_ai_brief_viewer_prefs" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  let groupId = 0;
  try {
    const originError = sameOriginRequestError(req);
    if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

    const userId = await readUserIdFromRequest(req);
    if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

    const { groupId: rawGroupId } = await params;
    groupId = parseSocialGroupId(rawGroupId) ?? 0;
    if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    if (typeof body?.personalCardOptIn !== "boolean") {
      return jsonNoStore({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!(await userHasSocialGroupAIBriefConsent(admin, userId))) {
      return jsonNoStore({ ok: false, error: "consent_required" }, { status: 403 });
    }
    const data = await saveGroupAIBriefViewerPrefs({
      admin,
      groupId,
      userId,
      personalCardOptIn: body.personalCardOptIn,
    });
    return jsonNoStore({ ok: true, data });
  } catch (error: any) {
    const code = String(error?.code ?? error?.message ?? "");
    if (code === "not_group_member") {
      return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });
    }
    if (code === "health_visibility_required_for_personal_card") {
      return jsonNoStore({ ok: false, error: "health_visibility_required_for_personal_card" }, { status: 409 });
    }
    console.error("[SocialGroupAIBriefMe/POST] group=%d err=%s", groupId, String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_save_group_ai_brief_viewer_prefs" }, { status: 500 });
  }
}
