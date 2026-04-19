import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  deleteSocialAdminContent,
  requireSocialAdmin,
} from "@/lib/server/socialAdmin";
import type { SocialAdminContentKind } from "@/types/socialAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function parseKind(raw: string): SocialAdminContentKind | null {
  if (raw === "post" || raw === "comment" || raw === "story") return raw;
  return null;
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
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
    const { kind: rawKind, id: rawId } = await params;
    const kind = parseKind(rawKind);
    const id = Number.parseInt(rawId, 10);
    if (!kind || !Number.isFinite(id) || id <= 0) {
      return jsonNoStore({ ok: false, error: "invalid_params" }, { status: 400 });
    }
    await deleteSocialAdminContent({
      admin: getSupabaseAdmin(),
      adminUserId: access.identity.userId,
      kind,
      id,
      reason: body?.reason,
    });
    return jsonNoStore({ ok: true });
  } catch (error: any) {
    console.error("[AdminSocialContent/DELETE] err=%s", String(error?.message ?? error));
    return jsonNoStore({ ok: false, error: "failed_to_delete_social_content" }, { status: 500 });
  }
}
