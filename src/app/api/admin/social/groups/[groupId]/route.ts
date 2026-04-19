import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  getSocialAdminGroupDetail,
  requireSocialAdmin,
  updateSocialAdminGroup,
} from "@/lib/server/socialAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function parseGroupId(raw: string) {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const access = await requireSocialAdmin(req);
  if (!access.ok) {
    return jsonNoStore({ ok: false, error: access.error }, { status: access.status });
  }

  try {
    const { groupId: rawGroupId } = await params;
    const groupId = parseGroupId(rawGroupId);
    if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });
    const data = await getSocialAdminGroupDetail(getSupabaseAdmin(), groupId);
    if (!data) {
      return jsonNoStore({ ok: false, error: "group_not_found" }, { status: 404 });
    }
    return jsonNoStore({ ok: true, data: { group: data } });
  } catch (error: any) {
    console.error("[AdminSocialGroupDetail/GET] err=%s", String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_load_social_group" }, { status: 500 });
  }
}

export async function PATCH(
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
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const { groupId: rawGroupId } = await params;
    const groupId = parseGroupId(rawGroupId);
    if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });
    await updateSocialAdminGroup({
      admin: getSupabaseAdmin(),
      adminUserId: access.identity.userId,
      groupId,
      action: body?.action,
      payload: body,
      reason: body?.reason,
    });
    return jsonNoStore({ ok: true });
  } catch (error: any) {
    const message = String(error?.message ?? error);
    if (
      message === "group_not_found" ||
      message === "cannot_remove_owner" ||
      message === "request_not_found" ||
      message === "request_required" ||
      message === "target_user_required"
    ) {
      return jsonNoStore({ ok: false, error: message }, { status: 409 });
    }
    console.error("[AdminSocialGroupDetail/PATCH] err=%s", message);
    return jsonNoStore({ ok: false, error: "failed_to_update_social_group" }, { status: 500 });
  }
}
