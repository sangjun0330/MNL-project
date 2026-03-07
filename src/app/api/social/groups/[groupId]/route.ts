import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function parseGroupId(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { groupId: rawGroupId } = await params;
  const groupId = parseGroupId(rawGroupId);
  if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body?.action ?? "");
  if (!["leave", "delete"].includes(action)) {
    return jsonNoStore({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const [{ data: group, error: groupErr }, { data: membership, error: membershipErr }] = await Promise.all([
      (admin as any)
        .from("rnest_social_groups")
        .select("id, owner_user_id")
        .eq("id", groupId)
        .maybeSingle(),
      (admin as any)
        .from("rnest_social_group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (groupErr) throw groupErr;
    if (membershipErr) throw membershipErr;
    if (!group) return jsonNoStore({ ok: false, error: "group_not_found" }, { status: 404 });
    if (!membership) return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });

    if (action === "delete") {
      if (membership.role !== "owner") {
        return jsonNoStore({ ok: false, error: "only_owner_can_delete_group" }, { status: 403 });
      }
      const { error } = await (admin as any).from("rnest_social_groups").delete().eq("id", groupId);
      if (error) throw error;
      return jsonNoStore({ ok: true });
    }

    if (membership.role === "owner") {
      return jsonNoStore({ ok: false, error: "owner_cannot_leave_group" }, { status: 409 });
    }

    const { error } = await (admin as any)
      .from("rnest_social_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);

    if (error) throw error;
    return jsonNoStore({ ok: true });
  } catch (err: any) {
    console.error("[SocialGroup/PATCH] id=%d err=%s", groupId, String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_update_group" }, { status: 500 });
  }
}
