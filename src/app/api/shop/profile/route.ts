import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { loadShopShippingProfile, saveShopShippingProfile } from "@/lib/server/shopProfileStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  try {
    const profile = await loadShopShippingProfile(userId);
    return jsonNoStore({ ok: true, data: { profile } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_load_shop_profile" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const profile = await saveShopShippingProfile(userId, (body as { profile?: unknown } | null)?.profile);
    return jsonNoStore({ ok: true, data: { profile } });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_save_shop_profile");
    if (message === "shop_profile_storage_unavailable") {
      return jsonNoStore({ ok: false, error: "shop_profile_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_save_shop_profile" }, { status: 500 });
  }
}

