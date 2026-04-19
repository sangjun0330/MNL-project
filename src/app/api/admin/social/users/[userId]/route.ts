import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  getSocialAdminUserDetail,
  requireSocialAdmin,
  updateSocialAdminUserState,
} from "@/lib/server/socialAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const access = await requireSocialAdmin(req);
  if (!access.ok) {
    return jsonNoStore({ ok: false, error: access.error }, { status: access.status });
  }

  try {
    const { userId } = await params;
    const data = await getSocialAdminUserDetail(getSupabaseAdmin(), userId);
    if (!data) {
      return jsonNoStore({ ok: false, error: "user_not_found" }, { status: 404 });
    }
    return jsonNoStore({ ok: true, data: { user: data } });
  } catch (error: any) {
    console.error("[AdminSocialUserDetail/GET] err=%s", String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_load_social_user" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
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
    const { userId } = await params;
    await updateSocialAdminUserState({
      admin: getSupabaseAdmin(),
      adminUserId: access.identity.userId,
      targetUserId: userId,
      state: body?.state,
      reason: body?.reason,
    });
    return jsonNoStore({ ok: true });
  } catch (error: any) {
    const message = String(error?.message ?? error);
    if (message === "cannot_restrict_self") {
      return jsonNoStore({ ok: false, error: message }, { status: 409 });
    }
    console.error("[AdminSocialUserDetail/PATCH] err=%s", message);
    return jsonNoStore({ ok: false, error: "failed_to_update_social_user" }, { status: 500 });
  }
}
