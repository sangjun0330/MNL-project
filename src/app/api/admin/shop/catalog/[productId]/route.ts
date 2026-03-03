import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { activateShopProduct, deactivateShopProduct, loadShopCatalogAll } from "@/lib/server/shopCatalogStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function readProductIdFromContext(ctx: any) {
  const params = await Promise.resolve(ctx?.params);
  return String(params?.productId ?? "").trim();
}

export async function DELETE(req: Request, ctx: any) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return jsonNoStore({ ok: false, error: admin.error }, { status: admin.status });

  const productId = await readProductIdFromContext(ctx);
  if (!productId) return jsonNoStore({ ok: false, error: "invalid_product_id" }, { status: 400 });

  try {
    await deactivateShopProduct(productId);
    const products = await loadShopCatalogAll();
    return jsonNoStore({ ok: true, data: { products } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_deactivate_product" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: any) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return jsonNoStore({ ok: false, error: admin.error }, { status: admin.status });

  const productId = await readProductIdFromContext(ctx);
  if (!productId) return jsonNoStore({ ok: false, error: "invalid_product_id" }, { status: 400 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const active = Boolean((body as { active?: unknown } | null)?.active);

  try {
    if (active) {
      await activateShopProduct(productId);
    } else {
      await deactivateShopProduct(productId);
    }
    const products = await loadShopCatalogAll();
    return jsonNoStore({ ok: true, data: { products } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_update_product_status" }, { status: 500 });
  }
}
