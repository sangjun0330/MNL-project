import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function readClaimIdFromContext(ctx: any) {
  const params = await Promise.resolve(ctx?.params);
  return String(params?.claimId ?? "").trim();
}

export async function POST(req: Request, ctx: any) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const claimId = await readClaimIdFromContext(ctx);
  if (!claimId) return jsonNoStore({ ok: false, error: "invalid_claim_id" }, { status: 400 });
  return jsonNoStore(
    {
      ok: false,
      error: "shop_claim_return_admin_only",
      message: "반품 회수 접수는 관리자 계정에서만 처리됩니다.",
    },
    { status: 403 }
  );
}
